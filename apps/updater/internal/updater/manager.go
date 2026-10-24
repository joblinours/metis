package updater

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"path/filepath"
	"sync"

	"connectrpc.com/connect/v2"
	updaterv1 "github.com/trymetis/metis/apps/updater/gen/metis/updater/v1"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Manager struct {
	cfg      Config
	env      EnvFile
	stack    Stack
	store    StateFile
	releases Releases

	mu      sync.Mutex
	state   State
	running bool
}

func NewManager(cfg Config) (*Manager, error) {
	manager := &Manager{
		cfg:      cfg,
		env:      EnvFile{Path: filepath.Join(cfg.InstallDir, ".env")},
		stack:    Stack{Dir: cfg.InstallDir},
		store:    StateFile{Path: filepath.Join(cfg.InstallDir, ".updater-state.json")},
		releases: Releases{TTL: cfg.ReleasesTTL},
	}
	if _, err := manager.env.Read(); err != nil {
		return nil, fmt.Errorf("reading the install's .env: %w", err)
	}
	state, err := manager.store.Load()
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", manager.store.Path, err)
	}
	if last := state.Last; last != nil && last.GetState() == updaterv1.UpgradeState_UPGRADE_STATE_RUNNING {
		last.State = updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED
		last.Error = "the updater stopped while this upgrade was running; check which images .env pins and the app's health"
		last.FinishedAt = timestamppb.Now()
		if err := manager.store.Save(state); err != nil {
			return nil, err
		}
	}
	manager.state = state
	return manager, nil
}

func (manager *Manager) currentImages() (Images, error) {
	values, err := manager.env.Read()
	if err != nil {
		return Images{}, connect.Errorf(connect.CodeInternal, "reading .env: %v", err)
	}
	return ImagesFromEnv(values), nil
}

func (manager *Manager) Status(ctx context.Context) (*updaterv1.GetStatusResponse, error) {
	current, err := manager.currentImages()
	if err != nil {
		return nil, err
	}
	versions, err := manager.releases.List(ctx)
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnavailable, "listing releases in %s: %v", Repository, err)
	}
	releases := make([]*updaterv1.Release, 0, len(versions))
	for _, version := range versions {
		releases = append(releases, &updaterv1.Release{Version: version})
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return &updaterv1.GetStatusResponse{
		CurrentVersion:  current.Version(),
		Releases:        releases,
		RollbackVersion: manager.rollbackVersion(),
	}, nil
}

func (manager *Manager) rollbackVersion() string {
	if manager.state.Previous == nil {
		return ""
	}
	return manager.state.Previous.Version()
}

func (manager *Manager) Last() *updaterv1.Upgrade {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.state.Last == nil {
		return nil
	}
	return proto.CloneOf(manager.state.Last)
}

func newID() string {
	bytes := make([]byte, 8)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (manager *Manager) Upgrade(ctx context.Context, version string) (*updaterv1.Upgrade, error) {
	if !IsReleaseVersion(version) {
		return nil, connect.Errorf(connect.CodeInvalidArgument, "%q is not a release version such as 1.4.0", version)
	}
	published, err := manager.releases.Has(ctx, version)
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnavailable, "listing releases in %s: %v", Repository, err)
	}
	if !published {
		return nil, connect.Errorf(connect.CodeNotFound, "%s is not a published release", version)
	}
	return manager.start(updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE, func() (string, error) {
		return version, nil
	})
}

func (manager *Manager) Rollback() (*updaterv1.Upgrade, error) {
	return manager.start(updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK, func() (string, error) {
		target := manager.rollbackVersion()
		if target == "" {
			return "", connect.NewError(connect.CodeFailedPrecondition, "there is no previous release to roll back to")
		}
		return target, nil
	})
}

func (manager *Manager) start(kind updaterv1.UpgradeKind, target func() (string, error)) (*updaterv1.Upgrade, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.running {
		return nil, connect.NewError(connect.CodeAborted, "an upgrade or rollback is already running")
	}
	from, err := manager.currentImages()
	if err != nil {
		return nil, err
	}
	version, err := target()
	if err != nil {
		return nil, err
	}
	if version == from.Version() {
		return nil, connect.Errorf(connect.CodeAlreadyExists, "%s is already running", version)
	}

	upgrade := &updaterv1.Upgrade{
		Id:          newID(),
		Kind:        kind,
		FromVersion: from.Version(),
		ToVersion:   version,
		State:       updaterv1.UpgradeState_UPGRADE_STATE_RUNNING,
		Step:        updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
		StartedAt:   timestamppb.Now(),
	}
	manager.state.Last = upgrade
	manager.running = true
	manager.saveLocked()
	log.Printf("[updater] %s %s → %s started (%s)", kind, displayVersion(from.Version()), version, upgrade.GetId())

	go manager.run(from, ReleaseImages(version))
	return proto.CloneOf(upgrade), nil
}

func displayVersion(version string) string {
	if version == "" {
		return "unpinned"
	}
	return version
}

func (manager *Manager) saveLocked() {
	if err := manager.store.Save(manager.state); err != nil {
		log.Printf("[updater] saving %s failed: %v", manager.store.Path, err)
	}
}

func (manager *Manager) step(step updaterv1.UpgradeStep) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state.Last.Step = step
	manager.saveLocked()
}

func (manager *Manager) finish(state updaterv1.UpgradeState, restored bool, err error, previous *Images) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	last := manager.state.Last
	last.State = state
	last.Restored = restored
	if err != nil {
		last.Error = err.Error()
	}
	last.FinishedAt = timestamppb.Now()
	if previous != nil {
		manager.state.Previous = previous
	}
	manager.running = false
	manager.saveLocked()
	if err != nil {
		log.Printf("[updater] %s %s (%s): %v", last.GetKind(), state, last.GetId(), err)
		return
	}
	log.Printf("[updater] %s %s (%s)", last.GetKind(), state, last.GetId())
}

func (manager *Manager) run(from, to Images) {
	ctx := context.Background()

	if err := manager.stack.Pull(ctx, to); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("pulling %s: %w", to.App, err), nil)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT)
	if err := manager.stack.Preflight(ctx, to); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("preflight failed: %w", err), nil)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH)
	if err := manager.switchTo(ctx, to); err != nil {
		manager.restore(ctx, from, fmt.Errorf("switching: %w", err))
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_READY)
	if err := WaitReady(ctx, manager.cfg.ReadyURL, manager.cfg.ReadyTimeout); err != nil {
		manager.restore(ctx, from, err)
		return
	}

	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED, false, nil, &from)
}

func (manager *Manager) switchTo(ctx context.Context, images Images) error {
	if err := manager.env.Set(images.Env()); err != nil {
		return fmt.Errorf("writing .env: %w", err)
	}
	return manager.stack.Switch(ctx)
}

func (manager *Manager) restore(ctx context.Context, from Images, cause error) {
	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE)
	err := manager.switchTo(ctx, from)
	if err == nil {
		err = WaitReady(ctx, manager.cfg.ReadyURL, manager.cfg.ReadyTimeout)
	}
	if err != nil {
		manager.finish(
			updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
			false,
			fmt.Errorf("%w; restoring %s also failed: %v", cause, displayVersion(from.Version()), err),
			nil,
		)
		return
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, true, cause, nil)
}
