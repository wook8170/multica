package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://multica:multica@localhost:5432/multica?sslmode=disable"
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		log.Fatal("Unable to connect to database:", err)
	}
	defer conn.Close(ctx)

	_, err = conn.Exec(ctx, "ALTER TABLE wiki_versions ADD COLUMN IF NOT EXISTS binary_state BYTEA;")
	if err != nil {
		log.Fatal("Failed to apply migration:", err)
	}

	fmt.Println("Successfully added binary_state column to wiki_versions")
}
