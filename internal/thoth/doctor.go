package thoth

type DoctorReport struct {
	Result string            `json:"result"`
	Checks []ValidationCheck `json:"checks"`
}

func Doctor(root string) DoctorReport {
	report := Validate(root)
	checks := append([]ValidationCheck{}, report.Checks...)

	registry, err := LoadRegistry(root)
	if err != nil {
		checks = append(checks, ValidationCheck{Check: "Routing smoke test", Status: "ERROR", Detail: err.Error()})
		return DoctorReport{Result: "ERROR", Checks: checks}
	}
	router := NewRouter(registry)
	route := router.Route("publish repo open source")
	if route.Result.SelectedSkill == nil || route.Result.SelectedSkill.ID != "publish-preflight" {
		checks = append(checks, ValidationCheck{Check: "Routing smoke test", Status: "ERROR", Detail: "publish request did not select publish-preflight"})
	} else {
		checks = append(checks, ValidationCheck{Check: "Routing smoke test", Status: "PASS", Detail: "publish request selects publish-preflight"})
	}

	policyWarnings := 0
	memoryWarnings := 0
	for _, skill := range registry.Skills {
		if skill.RequiresPolicy && len(policyGates(skill)) == 0 {
			policyWarnings++
		}
		if skill.RequiresMemory && memoryRequest(skill, skillCategory(skill)) == nil {
			memoryWarnings++
		}
	}
	if policyWarnings > 0 {
		checks = append(checks, ValidationCheck{Check: "Policy references", Status: "WARN", Detail: "One or more policy-required skills have no policy gate hints"})
	} else {
		checks = append(checks, ValidationCheck{Check: "Policy references", Status: "PASS", Detail: "Policy-required skills expose gate hints"})
	}
	if memoryWarnings > 0 {
		checks = append(checks, ValidationCheck{Check: "Memory references", Status: "WARN", Detail: "One or more memory-required skills have no memory request hint"})
	} else {
		checks = append(checks, ValidationCheck{Check: "Memory references", Status: "PASS", Detail: "Memory-required skills expose safe retrieval hints"})
	}

	result := "PASS"
	if hasValidationStatus(checks, "ERROR") {
		result = "ERROR"
	} else if hasValidationStatus(checks, "WARN") {
		result = "PASS WITH WARNINGS"
	}
	return DoctorReport{Result: result, Checks: checks}
}

func hasValidationStatus(checks []ValidationCheck, status string) bool {
	for _, check := range checks {
		if check.Status == status {
			return true
		}
	}
	return false
}

