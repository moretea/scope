package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"time"
)

func main() {
	hostname, _ := os.Hostname()
	var (
		addr   = flag.String("addr", "/var/run/scope/plugins/iowait.sock", "unix socket to listen for connections on")
		hostID = flag.String("hostname", hostname, "hostname of the host running this plugin")
	)
	flag.Parse()

	log.Println("Starting...")

	// Check we can get the iowait for the system
	_, err := iowait()
	if err != nil {
		log.Fatal(err)
	}

	os.Remove(*addr)
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	go func() {
		<-interrupt
		os.Remove(*addr)
		os.Exit(0)
	}()

	listener, err := net.Listen("unix", *addr)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		listener.Close()
		os.Remove(*addr)
	}()

	log.Printf("Listening on: unix://%s", *addr)

	plugin := &Plugin{HostID: *hostID}
	http.HandleFunc("/report", plugin.Report)
	if err := http.Serve(listener, nil); err != nil {
		log.Printf("error: %v", err)
	}
}

// Plugin groups the methods a plugin needs
type Plugin struct {
	HostID string
}

// Report is called by scope when a new report is needed. It is part of the
// "reporter" interface, which all plugins must implement.
func (p *Plugin) Report(w http.ResponseWriter, r *http.Request) {
	log.Println(r.URL.String())
	now := time.Now()
	nowISO := now.Format(time.RFC3339)
	value, err := iowait()
	if err != nil {
		log.Printf("error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	err = json.NewEncoder(w).Encode(map[string]interface{}{
		"Host": map[string]interface{}{
			"nodes": map[string]interface{}{
				p.HostID + ";<host>": map[string]interface{}{
					"metrics": map[string]interface{}{
						"iowait": map[string]interface{}{
							"samples": []interface{}{
								map[string]interface{}{
									"date":  nowISO,
									"value": value,
								},
							},
						},
					},
				},
			},
			"metric_templates": map[string]interface{}{
				"iowait": map[string]interface{}{
					"id":       "iowait",
					"label":    "IO Wait",
					"format":   "percent",
					"priority": 0.1, // low number so it shows up first
				},
			},
		},
		"Plugins": []interface{}{
			map[string]interface{}{
				"id":          "iowait",
				"label":       "iowait",
				"description": "Adds a graph of CPU IO Wait to hosts",
				"interfaces":  []string{"reporter"},
				"api_version": "1",
			},
		},
	})
	if err != nil {
		log.Printf("error: %v", err)
	}
}

// Get the latest iowait value
func iowait() (float64, error) {
	out, err := exec.Command("iostat", "-c").Output()
	if err != nil {
		return 0, fmt.Errorf("iowait: %v", err)
	}

	// Linux 4.2.0-25-generic (a109563eab38)	04/01/16	_x86_64_(4 CPU)
	//
	// avg-cpu:  %user   %nice %system %iowait  %steal   %idle
	//	          2.37    0.00    1.58    0.01    0.00   96.04
	lines := strings.Split(string(out), "\n")
	if len(lines) < 4 {
		return 0, fmt.Errorf("iowait: unexpected output: %q", out)
	}

	values := strings.Fields(lines[3])
	if len(values) != 6 {
		return 0, fmt.Errorf("iowait: unexpected output: %q", out)
	}

	return strconv.ParseFloat(values[3], 64)
}
