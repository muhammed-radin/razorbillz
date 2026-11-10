/**
 * Generates a full URL using the current origin and a provided hash.
 * @param {string} hash - The hash string (e.g., 'sfd' or '#sfd').
 * @param {string} [baseUrl] - The base URL to use (optional).
 * @returns {string} The complete URL.
 */
const generateHashLink = (hash, baseUrl) => {
  // Ensure the hash starts with a '#' symbol
  const formattedHash = hash.startsWith("#") ? hash : `#${hash}`;

  // Combine the browser's current origin with the formatted hash
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.origin
  ) {
    return `${window.location.origin}/${formattedHash}`;
  }
  return `${baseUrl || ""}/${formattedHash}`;
};

class URLOperator {
  constructor(baseUrl, paths, hashes, queryParams, chain = false) {
    this.baseUrl =
      baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    this.baseUrl = this.baseUrl.replace(/\/+$/, ""); // Remove trailing slashes
    this.path(paths);
    this.hash(hashes);
    this.queryParams = queryParams || {};
    this.chain = chain; // Store the chain flag
  }

  hash(hash, chain = false) {
    if (hash === undefined || hash === null) {
      this.hashes = "";
      if (chain || this.chain) {
        return this; // Return the instance for chaining
      }
      return `${this.baseUrl}/`;
    }
    const formattedHash = hash.startsWith("#") ? hash : `#${hash}`;
    this.hashes = formattedHash;
    if (chain || this.chain) {
      return this; // Return the instance for chaining
    }
    return `${this.baseUrl}/${formattedHash}`;
  }

  path(path, chain = false) {
    if (path === undefined || path === null) {
      this.paths = "/";
      if (chain || this.chain) {
        return this; // Return the instance for chaining
      }
      return `${this.baseUrl}/`;
    }
    const formattedPath = path.startsWith("/") ? path : `/${path}`;
    this.paths = formattedPath;
    if (chain || this.chain) {
      return this; // Return the instance for chaining
    }
    return `${this.baseUrl}${formattedPath}`;
  }

  query(queryParams, path, chain = false) {
    if (path) this.path(path);
    const queryString = new URLSearchParams(queryParams).toString();
    this.queryParams = queryParams;
    if (chain || this.chain) {
      return this; // Return the instance for chaining
    }
    return `${this.baseUrl}${this.paths}?${queryString}`;
  }

  url() {
    const queryString = new URLSearchParams(this.queryParams).toString();
    return `${this.baseUrl}${this.paths}${this.hashes}${
      queryString ? `?${queryString}` : ""
    }`;
  }

  hashPathURL() {
    const queryString = new URLSearchParams(this.queryParams).toString();
    return `${this.baseUrl}/#${this.paths}${this.hashes}${
      queryString ? `?${queryString}` : ""
    }`;
  }
}

function createURLOperator(baseUrl, paths, hashes, queryParams) {
  return new URLOperator(baseUrl, paths, hashes, queryParams, true);
}

function origin(baseUrl) {
  return new URLOperator(baseUrl, null, null, null, true);
}

if (typeof window !== "undefined") {
  window.generateHashLink = generateHashLink;
  window.createURLOperator = createURLOperator;
  window.origin = origin;
}
export { generateHashLink, createURLOperator, origin };
