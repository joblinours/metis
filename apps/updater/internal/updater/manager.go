package updater

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"path/filepath"
	"sync"
	"time"

	"connectrpc.com/connect/v2"
	updaterv1 "github.com/trymetis/metis/apps/updater/gen/metis/updater/v1"
	"golang.org/x/mod/semver"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	pendingSnapshot = "pending"
	currentSnapshot = "current"
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
		last.Error = "the updater stopped while this upgrade was running; check which images .env pins, that sqld and the app are running, and the app's health; any database snapshot is in " + manager.stack.SnapshotDir()
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

func (manager *Manager) snapshots() bool {
	values, err := manager.env.Read()
	return err == nil && StackRunsSqld(values)
}

func (manager *Manager) Status(ctx context.Context) (*updaterv1.GetStatusResponse, error) {
	current, err := manager.currentImages()
	if err != nil {
		return nil, err
	}
	list, err := manager.releases.List(ctx, current.Version())
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnavailable, "listing releases in %s: %v", Repository, err)
	}
	releases := make([]*updaterv1.Release, 0, len(list))
	for _, release := range list {
		releases = append(releases, &updaterv1.Release{Version: release.Version, Notes: release.Notes})
	}
	snapshots := manager.snapshots()
	manager.mu.Lock()
	defer manager.mu.Unlock()
	status := &updaterv1.GetStatusResponse{
		CurrentVersion: current.Version(),
		Releases:       releases,
		Snapshots:      snapshots,
	}
	if target := manager.undoTargetLocked(snapshots, current); target != "" {
		status.RollbackVersion = target
		status.RollbackSnapshotAt = timestamppb.New(manager.state.Snapshot.TakenAt)
	}
	return status, nil
}

func (manager *Manager) undoTargetLocked(snapshots bool, current Images) string {
	snapshot := manager.state.Snapshot
	if !snapshots || manager.state.Previous == nil || snapshot == nil ||
		snapshot.Installed == "" || snapshot.Installed != current.Version() ||
		!manager.stack.HasSnapshot(currentSnapshot) {
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

func (manager *Manager) Upgrade(ctx context.Context, version, requestedBy string) (*updaterv1.Upgrade, error) {
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
	return manager.start(updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE, requestedBy, func(from Images, _ bool) (string, error) {
		current := from.Version()
		if current != "" && current != version && semver.Compare("v"+version, "v"+current) < 0 {
			return "", connect.Errorf(connect.CodeFailedPrecondition, "%s is older than the running %s; only newer releases can be installed", version, current)
		}
		return version, nil
	})
}

func (manager *Manager) Rollback(requestedBy string) (*updaterv1.Upgrade, error) {
	return manager.start(updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK, requestedBy, func(from Images, snapshots bool) (string, error) {
		target := manager.undoTargetLocked(snapshots, from)
		if target == "" {
			return "", connect.NewError(connect.CodeFailedPrecondition, "there is no upgrade to undo")
		}
		return target, nil
	})
}

func (manager *Manager) start(kind updaterv1.UpgradeKind, requestedBy string, target func(from Images, snapshots bool) (string, error)) (*updaterv1.Upgrade, error) {
	snapshots := manager.snapshots()
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.running {
		return nil, connect.NewError(connect.CodeAborted, "an upgrade or rollback is already running")
	}
	from, err := manager.currentImages()
	if err != nil {
		return nil, err
	}
	version, err := target(from, snapshots)
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
		RequestedBy: requestedBy,
	}
	manager.state.Last = upgrade
	manager.running = true
	manager.saveLocked()
	log.Printf("[updater] %s %s → %s started (%s)", kind, displayVersion(from.Version()), version, upgrade.GetId())

	if kind == updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK {
		go manager.undo(ReleaseImages(version))
	} else {
		go manager.upgrade(from, ReleaseImages(version), snapshots)
	}
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

func (manager *Manager) finish(state updaterv1.UpgradeState, restored bool, err error, update func(*State)) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	last := manager.state.Last
	last.State = state
	last.Restored = restored
	if err != nil {
		last.Error = err.Error()
	}
	last.FinishedAt = timestamppb.Now()
	if update != nil {
		update(&manager.state)
	}
	manager.running = false
	manager.saveLocked()
	if err != nil {
		log.Printf("[updater] %s %s (%s): %v", last.GetKind(), state, last.GetId(), err)
		return
	}
	log.Printf("[updater] %s %s (%s)", last.GetKind(), state, last.GetId())
}

func (manager *Manager) upgrade(from, to Images, snapshots bool) {
	ctx := context.Background()

	if err := manager.stack.Pull(ctx, to); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("pulling %s: %w", to.App, err), nil)
		return
	}

	var snapshot *Snapshot
	if snapshots {
		manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SNAPSHOT)
		snapshot = &Snapshot{TakenAt: time.Now(), Installed: to.Version()}
		if err := manager.takeSnapshot(ctx); err != nil {
			manager.resume(ctx, from, fmt.Errorf("taking the database snapshot: %w", err))
			return
		}
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT)
	if err := manager.stack.Preflight(ctx, to); err != nil {
		cause := fmt.Errorf("preflight failed: %w", err)
		if snapshots {
			manager.restore(ctx, from, cause, true)
			return
		}
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, cause, nil)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH)
	if err := manager.switchTo(ctx, to); err != nil {
		manager.restore(ctx, from, fmt.Errorf("switching: %w", err), snapshots)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_READY)
	if err := WaitReady(ctx, manager.cfg.ReadyURL, manager.cfg.ReadyTimeout); err != nil {
		manager.restore(ctx, from, err, snapshots)
		return
	}

	if snapshot != nil {
		if err := manager.stack.PromoteSnapshot(pendingSnapshot, currentSnapshot); err != nil {
			log.Printf("[updater] keeping the database snapshot failed, so this upgrade cannot be undone: %v", err)
			snapshot = nil
		}
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED, false, nil, func(state *State) {
		state.Previous = &from
		state.Snapshot = snapshot
	})
}

func (manager *Manager) takeSnapshot(ctx context.Context) error {
	if err := manager.stack.StopApp(ctx); err != nil {
		return fmt.Errorf("stopping the app: %w", err)
	}
	return manager.stack.SaveSnapshot(ctx, pendingSnapshot)
}

func (manager *Manager) resume(ctx context.Context, from Images, cause error) {
	err := manager.stack.StartSqld(ctx)
	if err == nil {
		err = manager.stack.StartApp(ctx)
	}
	if err == nil {
		err = WaitReady(ctx, manager.cfg.ReadyURL, manager.cfg.ReadyTimeout)
	}
	if err != nil {
		manager.finish(
			updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
			false,
			fmt.Errorf("%w; starting %s again also failed: %v", cause, displayVersion(from.Version()), err),
			nil,
		)
		return
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, cause, nil)
}

func (manager *Manager) switchTo(ctx context.Context, images Images) error {
	if err := manager.env.Set(images.Env()); err != nil {
		return fmt.Errorf("writing .env: %w", err)
	}
	return manager.stack.Switch(ctx)
}

func (manager *Manager) restore(ctx context.Context, from Images, cause error, snapshot bool) {
	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE)
	var err error
	if snapshot {
		err = manager.stack.StopApp(ctx)
		if err == nil {
			err = manager.stack.RestoreSnapshot(ctx, pendingSnapshot)
		}
	}
	if err == nil {
		err = manager.switchTo(ctx, from)
	}
	if err == nil {
		err = WaitReady(ctx, manager.cfg.ReadyURL, manager.cfg.ReadyTimeout)
	}
	if err != nil {
		if snapshot {
			err = fmt.Errorf("%w (the database snapshot is in %s)", err, manager.stack.SnapshotDir()+"/"+pendingSnapshot)
		}
		manager.finish(
			updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
			false,
			fmt.Errorf("%w; restoring %s also failed: %v", cause, displayVersion(from.Version()), err),
			nil,
		)
		return
	}
	if snapshot {
		if err := manager.stack.DropSnapshot(pendingSnapshot); err != nil {
			log.Printf("[updater] removing the restored snapshot failed: %v", err)
		}
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, true, cause, nil)
}

func (manager *Manager) undo(to Images) {
	ctx := context.Background()

	if err := manager.stack.Pull(ctx, to); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("pulling %s: %w", to.App, err), nil)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE)
	if err := manager.stack.StopApp(ctx); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("stopping the app: %w", err), nil)
		return
	}
	if err := manager.stack.RestoreSnapshot(ctx, currentSnapshot); err != nil {
		manager.undoFailed(fmt.Errorf("restoring the database snapshot: %w", err))
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH)
	if err := manager.switchTo(ctx, to); err != nil {
		manager.undoFailed(fmt.Errorf("switching: %w", err))
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_READY)
	if err := WaitReady(ctx, manager.cfg.ReadyURL, manager.cfg.ReadyTimeout); err != nil {
		manager.undoFailed(err)
		return
	}

	if err := manager.stack.DropSnapshot(currentSnapshot); err != nil {
		log.Printf("[updater] removing the restored snapshot failed: %v", err)
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED, false, nil, func(state *State) {
		state.Previous = nil
		state.Snapshot = nil
	})
}

func (manager *Manager) undoFailed(err error) {
	manager.finish(
		updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
		false,
		fmt.Errorf("%w (the database snapshot is in %s)", err, manager.stack.SnapshotDir()+"/"+currentSnapshot),
		nil,
	)
}
