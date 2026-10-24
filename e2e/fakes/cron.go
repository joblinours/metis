package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

const defaultTickURL = "http://app:3000/api/workflows/tick"

func runCron() error {
	env, err := requireEnv("CRON_SECRET")
	if err != nil {
		return err
	}
	url := os.Getenv("CRON_URL")
	if url == "" {
		url = defaultTickURL
	}
	client := &http.Client{Timeout: 90 * time.Second}
	log.Printf("[cron] posting %s at the start of every minute", url)
	for {
		now := time.Now()
		time.Sleep(now.Truncate(time.Minute).Add(time.Minute).Sub(now))
		req, err := http.NewRequest(http.MethodPost, url, nil)
		if err != nil {
			return err
		}
		req.Header.Set("X-Metis-Secret", env["CRON_SECRET"])
		res, err := client.Do(req)
		if err != nil {
			log.Printf("[cron] tick failed: %v", err)
			continue
		}
		_ = res.Body.Close()
		log.Printf("[cron] tick answered %d", res.StatusCode)
	}
}
