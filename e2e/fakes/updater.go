package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sync"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	updaterv1 "github.com/trymetis/metis/apps/updater/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/updater/gen/metis/updater/v1/updaterv1connect"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	defaultUpdaterSocket = "/run/metis-updater/updater.sock"
	updaterReadyError    = "http://app:3000/api/readyz was not ready within 2m0s (last: answered 503)"
)

var releasePattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

type updaterSettings struct {
	Current  string   `json:"current"`
	Releases []string `json:"releases"`
	Rollback string   `json:"rollback"`
	Outcome  string   `json:"outcome"`
	StepMs   int      `json:"stepMs"`
}

func defaultUpdaterSettings() updaterSettings {
	return updaterSettings{
		Current:  "1.1.0",
		Releases: []string{"1.2.0", "1.1.0", "1.0.0"},
		Rollback: "1.0.0",
		Outcome:  "succeed",
		StepMs:   1_000,
	}
}

type upgradePlan struct {
	steps    []updaterv1.UpgradeStep
	state    updaterv1.UpgradeState
	restored bool
	err      func(from string) string
}

var throughReady = []updaterv1.UpgradeStep{
	updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
	updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT,
	updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH,
	updaterv1.UpgradeStep_UPGRADE_STEP_READY,
}

var upgradePlans = map[string]upgradePlan{
	"succeed": {
		steps: throughReady,
		state: updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED,
		err:   func(string) string { return "" },
	},
	"preflight-fails": {
		steps: []updaterv1.UpgradeStep{
			updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
			updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT,
		},
		state: updaterv1.UpgradeState_UPGRADE_STATE_FAILED,
		err:   func(string) string { return "preflight failed: exit status 1" },
	},
	"never-ready": {
		steps:    append(slices.Clone(throughReady), updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE),
		state:    updaterv1.UpgradeState_UPGRADE_STATE_FAILED,
		restored: true,
		err:      func(string) string { return updaterReadyError },
	},
	"restore-fails": {
		steps: append(slices.Clone(throughReady), updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE),
		state: updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
		err: func(from string) string {
			if from == "" {
				from = "unpinned"
			}
			return fmt.Sprintf("%s; restoring %s also failed: %s", updaterReadyError, from, updaterReadyError)
		},
	},
}

type updaterFake struct {
	socket string

	mu         sync.Mutex
	settings   updaterSettings
	last       *updaterv1.Upgrade
	generation int
	server     *http.Server
}

func (f *updaterFake) abortedIfRunning() error {
	if f.last != nil && f.last.GetState() == updaterv1.UpgradeState_UPGRADE_STATE_RUNNING {
		return connect.NewError(connect.CodeAborted, "an upgrade or rollback is already running")
	}
	return nil
}

func upgradeID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (f *updaterFake) start(kind updaterv1.UpgradeKind, to string) *updaterv1.Upgrade {
	from := f.settings.Current
	plan := upgradePlans[f.settings.Outcome]
	f.settings.Outcome = "succeed"
	upgrade := &updaterv1.Upgrade{
		Id:          upgradeID(),
		Kind:        kind,
		FromVersion: from,
		ToVersion:   to,
		State:       updaterv1.UpgradeState_UPGRADE_STATE_RUNNING,
		Step:        plan.steps[0],
		StartedAt:   timestamppb.Now(),
	}
	f.last = upgrade
	run := f.generation
	stepEvery := time.Duration(f.settings.StepMs) * time.Millisecond

	var advance func(index int)
	advance = func(index int) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if run != f.generation {
			return
		}
		if index < len(plan.steps) {
			upgrade.Step = plan.steps[index]
			time.AfterFunc(stepEvery, func() { advance(index + 1) })
			return
		}
		upgrade.State = plan.state
		upgrade.Restored = plan.restored
		upgrade.Error = plan.err(from)
		upgrade.FinishedAt = timestamppb.Now()
		if plan.state == updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED {
			f.settings.Rollback = from
			f.settings.Current = to
		}
	}
	upgrade.Step = plan.steps[0]
	time.AfterFunc(stepEvery, func() { advance(1) })
	return upgrade
}

func (f *updaterFake) GetStatus(context.Context, *updaterv1.GetStatusRequest) (*updaterv1.GetStatusResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	releases := make([]*updaterv1.Release, 0, len(f.settings.Releases))
	for _, version := range f.settings.Releases {
		releases = append(releases, &updaterv1.Release{Version: version})
	}
	return &updaterv1.GetStatusResponse{
		CurrentVersion:  f.settings.Current,
		Releases:        releases,
		RollbackVersion: f.settings.Rollback,
	}, nil
}

func (f *updaterFake) StartUpgrade(_ context.Context, req *updaterv1.StartUpgradeRequest) (*updaterv1.StartUpgradeResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	version := req.GetVersion()
	if !releasePattern.MatchString(version) {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Sprintf("%q is not a release version such as 1.4.0", version))
	}
	if !slices.Contains(f.settings.Releases, version) {
		return nil, connect.NewError(connect.CodeNotFound, version+" is not a published release")
	}
	if err := f.abortedIfRunning(); err != nil {
		return nil, err
	}
	if version == f.settings.Current {
		return nil, connect.NewError(connect.CodeAlreadyExists, version+" is already running")
	}
	return &updaterv1.StartUpgradeResponse{
		Upgrade: f.start(updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE, version),
	}, nil
}

func (f *updaterFake) GetUpgrade(context.Context, *updaterv1.GetUpgradeRequest) (*updaterv1.GetUpgradeResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return &updaterv1.GetUpgradeResponse{Upgrade: f.last}, nil
}

func (f *updaterFake) Rollback(context.Context, *updaterv1.RollbackRequest) (*updaterv1.RollbackResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.abortedIfRunning(); err != nil {
		return nil, err
	}
	if f.settings.Rollback == "" {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			"there is no previous release to roll back to")
	}
	if f.settings.Rollback == f.settings.Current {
		return nil, connect.NewError(connect.CodeAlreadyExists, f.settings.Rollback+" is already running")
	}
	return &updaterv1.RollbackResponse{
		Upgrade: f.start(updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK, f.settings.Rollback),
	}, nil
}

func (f *updaterFake) up() error {
	if f.server != nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(f.socket), 0o755); err != nil {
		return err
	}
	if err := os.Remove(f.socket); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	listener, err := net.Listen("unix", f.socket)
	if err != nil {
		return err
	}
	if err := os.Chmod(f.socket, 0o600); err != nil {
		_ = listener.Close()
		return err
	}
	rpc := connect.NewServer()
	updaterv1connect.RegisterUpdaterServiceHandler(rpc, f)
	mux := http.NewServeMux()
	connecthttp.Mount(mux, rpc)
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{Handler: mux, Protocols: protocols, ReadHeaderTimeout: 10 * time.Second}
	f.server = srv
	go func() {
		if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[updater] socket: %v", err)
		}
	}()
	return nil
}

func (f *updaterFake) down() error {
	if f.server == nil {
		return nil
	}
	err := f.server.Close()
	f.server = nil
	if rmErr := os.Remove(f.socket); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
		return rmErr
	}
	return err
}

func (f *updaterFake) state(w http.ResponseWriter) {
	upgrade := json.RawMessage("null")
	if f.last != nil {
		encoded, err := protojson.Marshal(f.last)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		upgrade = encoded
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"up":       f.server != nil,
		"settings": f.settings,
		"upgrade":  upgrade,
	})
}

func parseUpdaterSettings(r *http.Request) (updaterSettings, error) {
	settings := defaultUpdaterSettings()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return settings, err
	}
	raw := map[string]json.RawMessage{}
	if len(bytes.TrimSpace(body)) > 0 {
		if err := json.Unmarshal(body, &raw); err != nil {
			return settings, err
		}
	}
	decode := func(key string, into any) error {
		value, ok := raw[key]
		if !ok {
			return nil
		}
		return json.Unmarshal(value, into)
	}
	for key, into := range map[string]any{
		"current":  &settings.Current,
		"releases": &settings.Releases,
		"rollback": &settings.Rollback,
		"outcome":  &settings.Outcome,
		"stepMs":   &settings.StepMs,
	} {
		if err := decode(key, into); err != nil {
			return settings, fmt.Errorf("%s: %w", key, err)
		}
	}
	if _, ok := upgradePlans[settings.Outcome]; !ok {
		return settings, fmt.Errorf("outcome: %q is not one of succeed, preflight-fails, never-ready, restore-fails", settings.Outcome)
	}
	if settings.StepMs < 0 {
		return settings, errors.New("stepMs: must be at least 0")
	}
	return settings, nil
}

func runUpdater() error {
	socket := os.Getenv("E2E_UPDATER_SOCKET")
	if socket == "" {
		socket = defaultUpdaterSocket
	}
	fake := &updaterFake{socket: socket, settings: defaultUpdaterSettings()}
	if err := fake.up(); err != nil {
		return err
	}

	control := http.NewServeMux()
	healthRoute(control)
	control.HandleFunc("GET /state", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		fake.state(w)
	})
	control.HandleFunc("POST /reset", func(w http.ResponseWriter, r *http.Request) {
		settings, err := parseUpdaterSettings(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, []map[string]string{{"message": err.Error()}})
			return
		}
		fake.mu.Lock()
		defer fake.mu.Unlock()
		fake.generation++
		fake.last = nil
		fake.settings = settings
		if err := fake.up(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		fake.state(w)
	})
	control.HandleFunc("POST /hold", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		fake.generation++
		to := fake.settings.Current
		if len(fake.settings.Releases) > 0 {
			to = fake.settings.Releases[0]
		}
		fake.last = &updaterv1.Upgrade{
			Id:          "held",
			Kind:        updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE,
			FromVersion: fake.settings.Current,
			ToVersion:   to,
			State:       updaterv1.UpgradeState_UPGRADE_STATE_RUNNING,
			Step:        updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
			StartedAt:   timestamppb.Now(),
		}
		fake.state(w)
	})
	control.HandleFunc("POST /down", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		if err := fake.down(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		fake.state(w)
	})
	control.HandleFunc("POST /up", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		if err := fake.up(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		fake.state(w)
	})
	fallback(control, "GET /health | GET /state | POST /reset, /hold, /down, /up")

	log.Printf("[updater] serving the updater protocol on %s, control on :8080", socket)
	return serve(":8080", control)
}
