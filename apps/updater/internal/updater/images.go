package updater

import (
	"regexp"
	"strings"
)

const Repository = "ghcr.io/trymetis/metis"

var releaseVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

func IsReleaseVersion(version string) bool {
	return releaseVersion.MatchString(version)
}

type Images struct {
	App       string `json:"app"`
	Preflight string `json:"preflight"`
	Worker    string `json:"worker"`
}

func ReleaseImages(version string) Images {
	return Images{
		App:       Repository + ":" + version,
		Preflight: Repository + ":" + version + "-preflight",
		Worker:    Repository + ":" + version + "-worker",
	}
}

func ImagesFromEnv(values map[string]string) Images {
	return Images{
		App:       values["APP_IMAGE"],
		Preflight: values["PREFLIGHT_IMAGE"],
		Worker:    values["WORKER_IMAGE"],
	}
}

func (images Images) Env() map[string]string {
	return map[string]string{
		"APP_IMAGE":       images.App,
		"PREFLIGHT_IMAGE": images.Preflight,
		"WORKER_IMAGE":    images.Worker,
	}
}

func (images Images) Version() string {
	version, ok := strings.CutPrefix(images.App, Repository+":")
	if !ok || !IsReleaseVersion(version) || images != ReleaseImages(version) {
		return ""
	}
	return version
}
