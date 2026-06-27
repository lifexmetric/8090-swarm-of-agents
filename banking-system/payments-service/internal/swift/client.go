package swift

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/bank/payments-service/internal/model"
)

func transferURL() string {
	baseURL := os.Getenv("SWIFT_RAIL_URL")
	if baseURL == "" {
		baseURL = "http://localhost:9999"
	}
	// THE CRITICAL PATH: changing /v3/transfers → /v3/transfers breaks all payments
	return baseURL + "/v3/transfers"
}

// CheckConnectivity does a lightweight GET probe against the configured SWIFT path.
// Returns an error if the path is wrong (404) or the rail is unreachable.
func CheckConnectivity() error {
	url := transferURL() + "/probe"
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("swift rail unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("swift endpoint %s returned %d", url, resp.StatusCode)
	}
	return nil
}

func InitiateTransfer(req model.SwiftTransferRequest) (*model.SwiftTransferResponse, error) {
	url := transferURL()

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-API-Key", os.Getenv("SWIFT_RAIL_API_KEY"))

	log.Printf("Calling SWIFT rail: POST %s", url)
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("swift rail unreachable: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("swift rail returned %d: %s", resp.StatusCode, string(respBody))
	}

	var swiftResp model.SwiftTransferResponse
	if err := json.Unmarshal(respBody, &swiftResp); err != nil {
		return nil, fmt.Errorf("failed to parse swift response: %w", err)
	}
	return &swiftResp, nil
}
