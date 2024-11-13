package internal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

type Config struct {
	// Entrypoint is a directory in which to build TypeScript
	// sources.
	EntryPoint string

	// Bundle is true if files imported by an entry file
	// should be joined together in a single output file.
	Bundle bool

	// Watch is true in development. Sourcemaps are placed inline,
	// the output is unminified, and changes to any TypeScript
	// files will force a rebuild of the JavaScript output.
	Watch bool
}

// Build compiles TypeScript files into minified JavaScript
// files using github.com/evanw/esbuild.
func Build(config Config) error {
	files, err := getEntry(config.EntryPoint, config.Bundle)
	if err != nil {
		return err
	}
	options := api.BuildOptions{
		EntryPoints:  files,
		Bundle:       config.Bundle,
		Outdir:       config.EntryPoint,
		Write:        true,
		Platform:     api.PlatformBrowser,
		Format:       api.FormatESModule,
		OutExtension: map[string]string{".css": ".min.css"},
		External:     []string{"*.svg"},
		Banner: map[string]string{"css": "/*!\n" +
			" * Copyright Edward McFarlane. All rights reserved.\n" +
			" */"},
		Plugins: []api.Plugin{wgslPlugin},
	}
	options.MinifyIdentifiers = true
	options.MinifySyntax = true
	options.MinifyWhitespace = true
	options.Sourcemap = api.SourceMapLinked
	if config.Watch {
		ctx, err := api.Context(options)
		if err != nil {
			return err
		}
		return ctx.Watch(api.WatchOptions{})
	}
	result := api.Build(options)
	if len(result.Errors) > 0 {
		return fmt.Errorf("error building static files: %v", result.Errors)
	}
	if len(result.Warnings) > 0 {
		return fmt.Errorf("error building static files: %v", result.Warnings)
	}
	return nil
}

// getEntry walks the given directory and collects entry file paths
// for esbuild. It ignores test files and files prefixed with an underscore.
// Underscore prefixed files are assumed to be imported by and bundled together
// with the output of an entry file.
func getEntry(dir string, bundle bool) ([]string, error) {
	var matches []string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		basePath := filepath.Base(path)
		notPartial := !strings.HasPrefix(basePath, "_")
		notTest := !strings.HasSuffix(basePath, ".test.ts")
		isTS := strings.HasSuffix(basePath, ".ts")
		isCSS := strings.HasSuffix(basePath, ".css") && !strings.HasSuffix(basePath, ".min.css")
		if notPartial && notTest && (isTS || (bundle && isCSS)) {
			matches = append(matches, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return matches, nil
}

// https://github.com/evanw/esbuild-plugin-glslx/blob/main/main.js
// https://github.com/vanruesc/esbuild-plugin-glsl/blob/main/src/index.ts
var wgslPlugin = api.Plugin{
	Name: "wgsl",
	Setup: func(build api.PluginBuild) {
		onLoad := func(args api.OnLoadArgs) (api.OnLoadResult, error) {
			content, err := os.ReadFile(args.Path)
			if err != nil {
				return api.OnLoadResult{}, err
			}
			txt := string(content)
			ts := "declare const _default: string;\nexport default _default;"
			if err := os.WriteFile(args.Path+".d.ts", []byte(ts), 0644); err != nil {
				return api.OnLoadResult{}, err
			}
			return api.OnLoadResult{
				PluginName: "wgsl",
				Contents:   &txt,
				Loader:     api.LoaderText,
			}, nil
		}
		build.OnLoad(api.OnLoadOptions{
			Filter: `\.wgsl$`,
		}, onLoad)
	},
}
