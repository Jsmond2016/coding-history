package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port         int
	DatabaseURL  string
	LogLevel     string
	DBBackupCron string
	DBBackupDir  string
}

func Load() *Config {
	_ = godotenv.Load()

	port, _ := strconv.Atoi(getEnv("PORT", "5188"))

	return &Config{
		Port:         port,
		DatabaseURL:  getEnv("DATABASE_URL", "file:../database/coding-history.db"),
		LogLevel:     getEnv("LOG_LEVEL", "info"),
		DBBackupCron: getEnv("DB_BACKUP_CRON", "0 19 * * 5"),
		DBBackupDir:  getEnv("DB_BACKUP_DIR", ""),
	}
}

func (c *Config) GetDSN() string {
	raw := c.DatabaseURL
	// Remove "file:" prefix if present
	if len(raw) > 5 && raw[:5] == "file:" {
		raw = raw[5:]
	}
	return raw
}

func (c *Config) GetPort() string {
	return fmt.Sprintf(":%d", c.Port)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
