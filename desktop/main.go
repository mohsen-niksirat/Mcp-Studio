package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

func isPortOpen(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 200*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func main() {
	port := 4999
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = filepath.Abs(".")
	}
	baseDir := filepath.Dir(exePath)

	// If running inside desktop or root
	serverScript := filepath.Join(baseDir, "server", "dist", "index.js")
	if _, err := os.Stat(serverScript); os.IsNotExist(err) {
		serverScript = filepath.Join(baseDir, "..", "server", "dist", "index.js")
	}

	var serverCmd *exec.Cmd

	// If server isn't running on port 4999, start it
	if !isPortOpen(port) {
		if _, err := os.Stat(serverScript); err == nil {
			serverCmd = exec.Command("node", serverScript)
			// Hide console window on Windows
			serverCmd.SysProcAttr = &syscall.SysProcAttr{
				HideWindow:    true,
				CreationFlags: 0x08000000, // CREATE_NO_WINDOW
			}
			_ = serverCmd.Start()
		}
	}

	appURL := fmt.Sprintf("http://localhost:%d", port)

	// Wait up to 5 seconds for server to be ready
	for i := 0; i < 25; i++ {
		if isPortOpen(port) {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}

	// Launch in dedicated Window using Edge / Chrome app mode
	launched := false
	if runtime.GOOS == "windows" {
		// Look for Edge or Chrome
		edgePaths := []string{
			`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		}

		for _, p := range edgePaths {
			if _, err := os.Stat(p); err == nil {
				cmd := exec.Command(p, fmt.Sprintf("--app=%s", appURL), "--window-size=1360,860", "--new-window")
				_ = cmd.Start()
				launched = true
				break
			}
		}
	}

	// Fallback to default browser
	if !launched {
		openDefaultBrowser(appURL)
	}

	// Keep alive if we spawned the server
	if serverCmd != nil {
		_ = serverCmd.Wait()
	}
}

func openDefaultBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
