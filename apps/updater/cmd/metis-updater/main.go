package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	"github.com/trymetis/metis/apps/updater/gen/metis/updater/v1/updaterv1connect"
	"github.com/trymetis/metis/apps/updater/internal/updater"
)

const shutdownGrace = 5 * time.Second

func listenUnix(path string) (net.Listener, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		_ = listener.Close()
		return nil, err
	}
	return listener, nil
}

func main() {
	log.SetFlags(0)

	cfg, err := updater.ConfigFromEnv()
	if err != nil {
		log.Fatalf("[updater] %v", err)
	}
	manager, err := updater.NewManager(cfg)
	if err != nil {
		log.Fatalf("[updater] %v", err)
	}

	server := connect.NewServer()
	updaterv1connect.RegisterUpdaterServiceHandler(server, updater.NewService(manager))
	mux := http.NewServeMux()
	connecthttp.Mount(mux, server)

	listener, err := listenUnix(cfg.SocketPath)
	if err != nil {
		log.Fatalf("[updater] listening on %s: %v", cfg.SocketPath, err)
	}

	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{
		Handler:           mux,
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), shutdownGrace)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Printf("[updater] serving on %s for %s", cfg.SocketPath, cfg.InstallDir)
	if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("[updater] %v", err)
	}
}
