package contract

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestBoundaryMessageJSONUsesStableKeys(t *testing.T) {
	bytes, err := json.Marshal(CLIEnvelope{
		SchemaVersion: CLISchemaVersion,
		Command:       "lmti.test",
		Status:        StatusBlocked,
		Warnings:      []BoundaryMessage{},
		Errors:        []BoundaryMessage{{Code: ErrorSecretDetected, Message: "blocked"}},
		Data:          map[string]string{},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	text := string(bytes)
	if !strings.Contains(text, `"code"`) || strings.Contains(text, `"Code"`) {
		t.Fatalf("unexpected message json: %s", text)
	}
}

func TestMemoryRecordJSONUsesBoundaryShape(t *testing.T) {
	record := MemoryRecord{
		ID:            "mem_1",
		SchemaVersion: "lmti.memory.v1",
		ProjectID:     "lmti-atlas",
		Kind:          "note",
		Title:         "Test",
		Content:       "Content",
		Privacy:       PrivacyInternal,
		Confidence:    0.8,
		Importance:    0.5,
		SourceAgent:   "test",
		Tags:          []string{},
		RelatedFiles:  []string{},
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
		Metadata:      map[string]string{},
		ContentHash:   "hash",
	}
	bytes, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	text := string(bytes)
	if !strings.Contains(text, `"schemaVersion"`) || !strings.Contains(text, `"projectID"`) {
		t.Fatalf("unexpected memory json: %s", text)
	}
}

