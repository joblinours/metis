package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"golang.org/x/mod/semver"
)

const (
	NotesURL       = "https://api.github.com/repos/trymetis/metis/releases?per_page=100"
	notesTagPrefix = "app-v"
	notesTimeout   = 10 * time.Second
)

type Release struct {
	Version string
	Notes   string
}

type Releases struct {
	TTL time.Duration

	mu        sync.Mutex
	versions  []string
	notes     map[string]string
	fetchedAt time.Time
}

func (releases *Releases) List(ctx context.Context) ([]Release, error) {
	releases.mu.Lock()
	defer releases.mu.Unlock()
	if releases.versions == nil || time.Since(releases.fetchedAt) >= releases.TTL {
		if err := releases.refreshLocked(ctx); err != nil {
			return nil, err
		}
	}
	list := make([]Release, 0, len(releases.versions))
	for _, version := range releases.versions {
		list = append(list, Release{Version: version, Notes: releases.notes[version]})
	}
	return list, nil
}

func (releases *Releases) refreshLocked(ctx context.Context) error {
	versions, err := fetchReleases(ctx)
	if err != nil {
		if releases.versions != nil {
			log.Printf("[updater] listing releases failed, keeping the last list: %v", err)
			return nil
		}
		return err
	}
	notes, err := fetchNotes(ctx)
	if err != nil {
		log.Printf("[updater] fetching release notes failed, keeping the last notes: %v", err)
		notes = releases.notes
	}
	releases.versions = versions
	releases.notes = notes
	releases.fetchedAt = time.Now()
	return nil
}

func (releases *Releases) Has(ctx context.Context, version string) (bool, error) {
	list, err := releases.List(ctx)
	if err != nil {
		return false, err
	}
	return slices.ContainsFunc(list, func(release Release) bool { return release.Version == version }), nil
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

type githubRelease struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
	Draft   bool   `json:"draft"`
}

func fetchNotes(ctx context.Context) (map[string]string, error) {
	ctx, cancel := context.WithTimeout(ctx, notesTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, NotesURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "metis-updater")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %d", NotesURL, res.StatusCode)
	}
	var list []githubRelease
	if err := json.NewDecoder(res.Body).Decode(&list); err != nil {
		return nil, err
	}
	notes := map[string]string{}
	for _, release := range list {
		version, ok := strings.CutPrefix(release.TagName, notesTagPrefix)
		if !ok || release.Draft || !IsReleaseVersion(version) {
			continue
		}
		notes[version] = strings.TrimSpace(release.Body)
	}
	return notes, nil
}
