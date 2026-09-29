import JSZip from "jszip";

const slugify = (s) =>
  (s || "buildora-site")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "buildora-site";

// files: { "/App.js": { code }, ... }  dependencies: { pkg: "latest" }
export async function downloadProjectZip(files, dependencies, name) {
  const slug = slugify(name);
  const zip = new JSZip();
  const root = zip.folder(slug);

  const deps = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    ...Object.fromEntries(
      Object.keys(dependencies || {}).map((k) => [k, "latest"])
    )
  };

  root.file(
    "package.json",
    JSON.stringify(
      {
        name: slug,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: deps,
        devDependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^6.0.5" }
      },
      null,
      2
    )
  );

  root.file(
    "vite.config.js",
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Lets Vite read JSX inside .js files (the AI writes components as .js).
export default defineConfig({
  plugins: [react()],
  esbuild: { loader: "jsx", include: /src\\/.*\\.jsx?$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } }
});
`
  );

  root.file(
    "index.html",
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name || "My Website"}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
  );

  const hasCss = !!files["/styles.css"];
  root.file(
    "src/main.jsx",
    `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
${hasCss ? 'import "./styles.css";\n' : ""}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
`
  );

  Object.entries(files).forEach(([path, f]) => {
    root.file("src" + path, f.code);
  });

  root.file(
    "README.md",
    `# ${name || "My Website"}\n\nBuilt with Buildora.\n\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n`
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = slug + ".zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
