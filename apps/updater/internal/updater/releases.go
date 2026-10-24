package updater

import (
	"context"
	"log"
	"slices"
	"sync"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"golang.org/x/mod/semver"
)

type Releases struct {
	TTL time.Duration

	mu        sync.Mutex
	versions  []string
	fetchedAt time.Time
}

func (releases *Releases) List(ctx context.Context) ([]string, error) {
	releases.mu.Lock()
	defer releases.mu.Unlock()
	if releases.versions != nil && time.Since(releases.fetchedAt) < releases.TTL {
		return releases.versions, nil
	}
	versions, err := fetchReleases(ctx)
	if err != nil {
		if releases.versions != nil {
			log.Printf("[updater] listing releases failed, keeping the last list: %v", err)
			return releases.versions, nil
		}
		return nil, err
	}
	releases.versions = versions
	releases.fetchedAt = time.Now()
	return versions, nil
}

func (releases *Releases) Has(ctx context.Context, version string) (bool, error) {
	versions, err := releases.List(ctx)
	if err != nil {
		return false, err
	}
	return slices.Contains(versions, version), nil
}

func fetchReleases(ctx context.Context) ([]string, error) {
	repo, err := name.NewRepository(Repository)
	if err != nil {
		return nil, err
	}
	tags, err := remote.List(repo, remote.WithContext(ctx), remote.WithAuth(authn.Anonymous))
	if err != nil {
		return nil, err
	}
	versions := []string{}
	for _, tag := range tags {
		if IsReleaseVersion(tag) {
			versions = append(versions, tag)
		}
	}
	slices.SortFunc(versions, func(a, b string) int {
		return semver.Compare("v"+b, "v"+a)
	})
	return versions, nil
}
