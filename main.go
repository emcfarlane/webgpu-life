package main

import (
	"bytes"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"sync"

	"github.com/emcfarlane/webgpu-life/internal"
	"github.com/google/safehtml/template"
)

var (
	devMode   = flag.Bool("dev", false, "enable developer mode (reload templates on each page load, serve non-minified JS/CSS, etc.)")
	buildMode = flag.Bool("build", false, "build the static assets")
	srcDir    = flag.String("src", "src", "source directory for static assets")
	hostAddr  = flag.String("host", "localhost:8080", "Host address for the server")
)

func main() {
	flag.Parse()
	slog.Info("hello, world")

	if *devMode || *buildMode {
		if err := internal.Build(internal.Config{
			EntryPoint: *srcDir,
			Bundle:     true,
			Watch:      *devMode,
		}); err != nil {
			log.Fatal(err)
		}
		if *buildMode {
			slog.Info("Built static assets", slog.String("dir", *srcDir))
			return
		}
	}
	ts := template.TrustedSourceFromFlag(flag.Lookup("src").Value)
	fsys := template.TrustedFSFromTrustedSource(ts)

	var (
		mu        sync.Mutex
		templates map[string]*template.Template
	)
	loadTemplate := func(name string) (*template.Template, error) {
		if name == "/" {
			name = "life"
		}
		mu.Lock()
		defer mu.Unlock()
		if *devMode || templates == nil {
			tmpls, err := internal.ParsePageTemplates(fsys)
			if err != nil {
				log.Fatalf("ParsePageTemplates: %v", err)
			}
			templates = tmpls
		}
		t, ok := templates[name]
		if !ok {
			return nil, fmt.Errorf("template not found: %q", name)
		}
		return t, nil
	}

	mux := http.NewServeMux()
	mux.Handle("/src/", http.StripPrefix("/src/", http.FileServer(http.Dir(*srcDir))))
	mux.HandleFunc("/{$}", func(w http.ResponseWriter, r *http.Request) {
		t, err := loadTemplate(r.URL.Path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var buf bytes.Buffer
		if err := t.Execute(&buf, nil); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		buf.WriteTo(w)
	})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slog.Info("Request received",
			slog.String("method", r.Method),
			slog.String("url", r.URL.String()),
		)
		if *devMode {
			w.Header().Set("Cache-Control", "no-cache")
		}
		mux.ServeHTTP(w, r)
	})

	addr := *hostAddr
	slog.Info("Listening on addr %s", slog.String("addr", addr))
	if err := http.ListenAndServe(addr, handler); err != nil {
		if err != http.ErrServerClosed {
			log.Fatalf("http.ListenAndServe: %v", err)
		}
		log.Println("Server closed")
	}
}
