package migrate

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/vuthuanphat6-byte/lmti-atlas/internal/config"
	"github.com/vuthuanphat6-byte/lmti-atlas/pkg/contract"
)

func TestParseLegacyMemoryPreservesUnknownMetadata(t *testing.T) {
	cfg := config.Default()
	records, err := parseLegacyMemory([]byte(`[{"id":"old1","title":"Rule","content":"Use safe context.","privacy":"internal","legacy_score":7}]`), cfg)
	if err != nil {
		t.Fatalf("parseLegacyMemory returned error: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("records %d", len(records))
	}
	if records[0].Metadata["legacy_score"] != "7" {
		t.Fatalf("metadata was not preserved: %#v", records[0].Metadata)
	}
}

func TestFromJSONDryRunBlocksSecretLikeFile(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".lmti"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".lmti", "memory.json"), []byte(`{"title":"Bad","api_key":"abcdefghijklmnopqrstuvwxyz123456"}`), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	report, warnings, errors := FromJSON(context.Background(), root, config.Default(), FromJSONOptions{DryRun: true})
	if len(errors) > 0 {
		t.Fatalf("unexpected errors: %#v", errors)
	}
	if len(warnings) == 0 || warnings[0].Code != contract.ErrorSecretDetected {
		t.Fatalf("expected secret warning, got %#v", warnings)
	}
	if len(report.BlockedFiles) != 1 {
		t.Fatalf("blocked files %#v", report.BlockedFiles)
	}
}
