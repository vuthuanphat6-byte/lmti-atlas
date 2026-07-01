package thoth

import (
	"encoding/json"
	"io"
)

func WriteJSON(w io.Writer, command string, status string, warnings []Message, errors []Message, data any) error {
	if warnings == nil {
		warnings = []Message{}
	}
	if errors == nil {
		errors = []Message{}
	}
	envelope := Envelope{
		SchemaVersion: SchemaVersion,
		Command:       command,
		Status:        status,
		Data:          data,
		Warnings:      warnings,
		Errors:        errors,
	}
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(envelope)
}
