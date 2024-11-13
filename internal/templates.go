package internal

import (
	"fmt"
	"net/url"
	"path"
	"strings"

	"github.com/google/safehtml/template"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

var templateFuncs = template.FuncMap{
	"add":      func(i, j int) int { return i + j },
	"subtract": func(i, j int) int { return i - j },
	"pluralize": func(i int, s string) string {
		if i == 1 {
			return s
		}
		return s + "s"
	},
	"commaseparate": func(s []string) string {
		return strings.Join(s, ", ")
	},
	"stripscheme": func(url string) string {
		if i := strings.Index(url, "://"); i > 0 {
			return url[i+len("://"):]
		}
		return url
	},
	"capitalize":  cases.Title(language.Und).String,
	"queryescape": url.QueryEscape,
}

// ParsePageTemplates parses html templates contained in the given filesystem in
// order to generate a map of Name->*template.Template.
//
// Separate templates are used so that certain contextual functions (e.g.
// templateName) can be bound independently for each page.
//
// Templates in directories prefixed with an underscore are considered helper
// templates and parsed together with the files in each base directory.
func ParsePageTemplates(fsys template.TrustedFS) (map[string]*template.Template, error) {
	templates := make(map[string]*template.Template)
	htmlSets := [][]string{
		{"life"},
	}
	for _, set := range htmlSets {
		t, err := template.New("base.tmpl").Funcs(templateFuncs).ParseFS(fsys, "base.tmpl")
		if err != nil {
			return nil, fmt.Errorf("ParseFS: %v", err)
		}
		// TODO: Add helper templates.
		//helperGlob := "shared/*/*.tmpl"
		//if _, err := t.ParseFS(fsys, helperGlob); err != nil {
		//	return nil, fmt.Errorf("ParseFS(%q): %v", helperGlob, err)
		//}
		for _, f := range set {
			if _, err := t.ParseFS(fsys, path.Join(f, "*.tmpl")); err != nil {
				return nil, fmt.Errorf("ParseFS(%v): %v", f, err)
			}
		}
		templates[set[0]] = t
	}
	return templates, nil
}
