package updater

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	SocketPath   string
	InstallDir   string
	ReadyURL     string
	ReadyTimeout time.Duration
	ReleasesTTL  time.Duration
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func durationEnv(name string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("%s=%q is not a positive duration such as 5m", name, raw)
	}
	return value, nil
}

func ConfigFromEnv() (Config, error) {
	cfg := Config{
		SocketPath: envOr("METIS_UPDATER_SOCKET", "/run/metis-updater/updater.sock"),
		InstallDir: envOr("METIS_INSTALL_DIR", "/opt/metis-suite"),
		ReadyURL:   envOr("METIS_UPDATER_READY_URL", "http://app:3000/api/readyz"),
	}
	var err error
	if cfg.ReadyTimeout, err = durationEnv("METIS_UPDATER_READY_TIMEOUT", 2*time.Minute); err != nil {
		return Config{}, err
	}
	if cfg.ReleasesTTL, err = durationEnv("METIS_UPDATER_RELEASES_TTL", 5*time.Minute); err != nil {
		return Config{}, err
	}
	return cfg, nil
}
