package main

import (
	"os"

	"github.com/vuthuanphat6-byte/lmti-atlas/internal/app"
)

func main() {
	os.Exit(app.Run(os.Args[1:], os.Stdout, os.Stderr))
}
