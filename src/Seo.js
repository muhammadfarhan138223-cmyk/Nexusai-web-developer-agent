import { useEffect } from "react";
import { SITE_URL } from "./site";

function upsert(selector, create, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export function useSeo(title, description, { noindex = false, path = "/" } = {}) {
  useEffect(() => {
    document.title = title;
    upsert(
      'meta[name="description"]',
      () => Object.assign(document.createElement("meta"), { name: "description" }),
      "content",
      description
    );
    upsert(
      'meta[name="robots"]',
      () => Object.assign(document.createElement("meta"), { name: "robots" }),
      "content",
      noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"
    );
    upsert(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement("link"), { rel: "canonical" }),
      "href",
      SITE_URL + path
    );
  }, [title, description, noindex, path]);
}
