#!/usr/bin/env node
/* Bundled dependency: yaml (ISC)

Copyright Eemeli Aro <eemeli@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports2) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports2.ALIAS = ALIAS;
    exports2.DOC = DOC;
    exports2.MAP = MAP;
    exports2.NODE_TYPE = NODE_TYPE;
    exports2.PAIR = PAIR;
    exports2.SCALAR = SCALAR;
    exports2.SEQ = SEQ;
    exports2.hasAnchor = hasAnchor;
    exports2.isAlias = isAlias;
    exports2.isCollection = isCollection;
    exports2.isDocument = isDocument;
    exports2.isMap = isMap;
    exports2.isNode = isNode;
    exports2.isPair = isPair;
    exports2.isScalar = isScalar;
    exports2.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports2.visit = visit;
    exports2.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports2.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports2.anchorIsValid = anchorIsValid;
    exports2.anchorNames = anchorNames;
    exports2.createNodeAnchors = createNodeAnchors;
    exports2.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports2) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports2.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports2) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports2.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports2) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports2.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports2) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports2.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports2.Scalar = Scalar;
    exports2.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports2.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports2.Collection = Collection;
    exports2.collectionFromPath = collectionFromPath;
    exports2.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports2) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports2.indentComment = indentComment;
    exports2.lineComment = lineComment;
    exports2.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports2) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports2.FOLD_BLOCK = FOLD_BLOCK;
    exports2.FOLD_FLOW = FOLD_FLOW;
    exports2.FOLD_QUOTED = FOLD_QUOTED;
    exports2.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports2.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports2) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports2.createStringifyContext = createStringifyContext;
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports2.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports2) {
    "use strict";
    var node_process = require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports2.debug = debug;
    exports2.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports2.addMergeToJSMap = addMergeToJSMap;
    exports2.isMergeKey = isMergeKey;
    exports2.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports2) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports2.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports2.Pair = Pair;
    exports2.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports2.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports2) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports2.YAMLMap = YAMLMap;
    exports2.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports2.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports2.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports2.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports2) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports2.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports2.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports2.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports2) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports2.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports2) {
    "use strict";
    var node_buffer = require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports2.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports2.createPairs = createPairs;
    exports2.pairs = pairs;
    exports2.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports2.YAMLOMap = YAMLOMap;
    exports2.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports2.falseTag = falseTag;
    exports2.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intBin = intBin;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports2.YAMLSet = YAMLSet;
    exports2.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports2.floatTime = floatTime;
    exports2.intTime = intTime;
    exports2.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports2.coreKnownTags = coreKnownTags;
    exports2.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports2.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports2.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports2.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports2) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "…" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "…";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "…\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports2.YAMLError = YAMLError;
    exports2.YAMLParseError = YAMLParseError;
    exports2.YAMLWarning = YAMLWarning;
    exports2.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports2) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports2.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports2) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports2.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports2) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports2.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports2) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports2.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports2) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports2.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports2) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports2.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports2) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports2.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports2.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports2.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports2.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "",
      // Unicode next line
      _: " ",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports2.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports2.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports2) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports2.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports2.composeEmptyNode = composeEmptyNode;
    exports2.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports2) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports2.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports2) {
    "use strict";
    var node_process = require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports2.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports2) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports2.createScalarToken = createScalarToken;
    exports2.resolveAsScalar = resolveAsScalar;
    exports2.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports2) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports2) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports2.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports2) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports2.createScalarToken = cstScalar.createScalarToken;
    exports2.resolveAsScalar = cstScalar.resolveAsScalar;
    exports2.setScalarValue = cstScalar.setScalarValue;
    exports2.stringify = cstStringify.stringify;
    exports2.visit = cstVisit.visit;
    exports2.BOM = BOM;
    exports2.DOCUMENT = DOCUMENT;
    exports2.FLOW_END = FLOW_END;
    exports2.SCALAR = SCALAR;
    exports2.isCollection = isCollection;
    exports2.isScalar = isScalar;
    exports2.prettyToken = prettyToken;
    exports2.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports2) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports2.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports2) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports2.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports2) {
    "use strict";
    var node_process = require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports2.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports2) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports2.parse = parse;
    exports2.parseAllDocuments = parseAllDocuments;
    exports2.parseDocument = parseDocument;
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports2) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports2.Composer = composer.Composer;
    exports2.Document = Document.Document;
    exports2.Schema = Schema.Schema;
    exports2.YAMLError = errors.YAMLError;
    exports2.YAMLParseError = errors.YAMLParseError;
    exports2.YAMLWarning = errors.YAMLWarning;
    exports2.Alias = Alias.Alias;
    exports2.isAlias = identity.isAlias;
    exports2.isCollection = identity.isCollection;
    exports2.isDocument = identity.isDocument;
    exports2.isMap = identity.isMap;
    exports2.isNode = identity.isNode;
    exports2.isPair = identity.isPair;
    exports2.isScalar = identity.isScalar;
    exports2.isSeq = identity.isSeq;
    exports2.Pair = Pair.Pair;
    exports2.Scalar = Scalar.Scalar;
    exports2.YAMLMap = YAMLMap.YAMLMap;
    exports2.YAMLSeq = YAMLSeq.YAMLSeq;
    exports2.CST = cst;
    exports2.Lexer = lexer.Lexer;
    exports2.LineCounter = lineCounter.LineCounter;
    exports2.Parser = parser.Parser;
    exports2.parse = publicApi.parse;
    exports2.parseAllDocuments = publicApi.parseAllDocuments;
    exports2.parseDocument = publicApi.parseDocument;
    exports2.stringify = publicApi.stringify;
    exports2.visit = visit.visit;
    exports2.visitAsync = visit.visitAsync;
  }
});

// scripts/statectl-src/route-catalog.json
var require_route_catalog = __commonJS({
  "scripts/statectl-src/route-catalog.json"(exports2, module2) {
    module2.exports = {
      core: [
        "team_lead",
        "data_audit",
        "domain_expert",
        "causal_discovery",
        "causal_check",
        "report_writer"
      ],
      design: [
        "randomized_assignment",
        "single_time_observational",
        "longitudinal_gmethods",
        "difference_in_differences",
        "regression_discontinuity",
        "instrumental_variables",
        "synthetic_control_time_series",
        "interference_spillovers",
        "descriptive_association"
      ],
      support: [
        "heterogeneous-effects",
        "dose-response",
        "mediation",
        "policy-making-and-transportability",
        "non-continuous-outcomes",
        "statistical-validity"
      ]
    };
  }
});

// scripts/statectl-src/core.cjs
var require_core = __commonJS({
  "scripts/statectl-src/core.cjs"(exports2, module2) {
    "use strict";
    var crypto = require("node:crypto");
    var fs = require("node:fs");
    var path = require("node:path");
    var { isDeepStrictEqual } = require("node:util");
    var YAML = require_dist();
    var ROUTES = require_route_catalog();
    var SCHEMA_VERSION = 7;
    var MANIFEST_VERSION = 3;
    var RECEIPT_MANIFEST_VERSION = 2;
    var LEGACY_MANIFEST_VERSION = 1;
    var PHASE_CAPSULE_PROTOCOL = "phase-capsule-v1";
    var PHASE_CAPSULE_VERSION = 1;
    var STATE_FILE = "project_state.yaml";
    var ARCHIVE_DIR = "project_state.archives";
    var MAX_INTENT_LENGTH = 1e3;
    var MAX_RESPONSE_TEXT_LENGTH = 1e3;
    var MAX_RESPONSE_FRAMING_LENGTH = 6e3;
    var MAX_ARTIFACT_SLUG_LENGTH = 80;
    var MAX_EVIDENCE_LOCATOR_LENGTH = 500;
    var MAX_RECEIPT_DEVIATIONS = 20;
    var MAX_ANALYSIS_OPTIONS = 3;
    var MAX_ANALYSIS_OPTION_TEXT_LENGTH = 500;
    var MAX_ANALYSIS_OPTION_LIST_ITEMS = 4;
    var MAX_ANALYSIS_OPTION_TOTAL_TEXT_LENGTH = 2500;
    var DISCOVERY_CONTRACT_KEYS = /* @__PURE__ */ new Set([
      "target",
      "input_refs",
      "variables",
      "method_plan",
      "constraints",
      "diagnostic_requirements",
      "output_type",
      "claim_boundary"
    ]);
    var ANALYSIS_CONTRACT_KEYS = /* @__PURE__ */ new Set([
      "target",
      "input_refs",
      "method_plan",
      "execution_requirements",
      "output_type",
      "claim_boundary"
    ]);
    var REQUIREMENT_KINDS = /* @__PURE__ */ new Set([
      "target",
      "input_ref",
      "method_plan",
      "execution_requirement",
      "output_type",
      "claim_boundary",
      "variable",
      "constraint",
      "diagnostic_requirement",
      "report_goal",
      "audience",
      "target_section",
      "planned_structure",
      "key_points",
      "wording_constraints",
      "current_format",
      "analysis_artifact_id"
    ]);
    var ARTIFACT_ROLES = ["completion", "infeasibility_evidence"];
    var EXECUTION_RECEIPT_KEYS = /* @__PURE__ */ new Set([
      "contract_hash",
      "completed_requirements",
      "unmet_requirements",
      "supplemental_work",
      "evidence_files",
      "requirement_evidence",
      "deviations"
    ]);
    var LEGACY_EXECUTION_RECEIPT_KEYS = /* @__PURE__ */ new Set([
      "contract_hash",
      "completed_requirements",
      "unmet_requirements",
      "supplemental_work",
      "evidence_files"
    ]);
    var WELCOME_LINE = "[Causal-Consultant Loaded] This is a new project. Causal analysis team ready.";
    var MENU_NEXT_STEPS = "Choose one option, or suggest another action.";
    var RESPONSE_HEADINGS = /* @__PURE__ */ new Set([
      "[OK Confirmed]",
      "[> Framing]",
      "[+ Consultant Options]",
      "[! Boundary]",
      "[? Next Steps]"
    ]);
    var DERIVED_SUMMARY_FIELDS = [
      "data_audit_complete",
      "domain_knowledge_complete",
      "causal_check_complete",
      "exploration_complete",
      "analysis_output",
      "report_output"
    ];
    var REPORT_SCOPE_MATERIAL_FIELDS = [
      "report_goal",
      "audience",
      "target_section",
      "planned_structure",
      "key_points",
      "wording_constraints",
      "analysis_artifact_ids"
    ];
    var REQUIRED_TOP_LEVEL = [
      "state_meta",
      "project_summary",
      "council_chamber",
      "next_step_plan",
      "pending_decision",
      "response_receipt",
      "data_facts",
      "domain_knowledge",
      "causal_facts",
      "discovery_sidecar",
      "report_assembly",
      "artifact_records"
    ];
    var LEGACY_TOP_LEVEL = REQUIRED_TOP_LEVEL.filter(
      (key) => !["state_meta", "pending_decision", "response_receipt"].includes(key)
    );
    var V2_TOP_LEVEL = REQUIRED_TOP_LEVEL.filter(
      (key) => !["pending_decision", "response_receipt"].includes(key)
    );
    var CORE_WORKERS = new Set(ROUTES.core.filter((id) => id !== "team_lead"));
    var DESIGN_IDS = new Set(ROUTES.design);
    var SUPPORT_IDS = new Set(ROUTES.support);
    var ARTIFACT_ACTORS = /* @__PURE__ */ new Set([
      "data_audit",
      "causal_discovery",
      "report_writer"
    ]);
    var SECTION_KEYS = {
      project_summary: /* @__PURE__ */ new Set([
        "title",
        "objective",
        "materials",
        "last_updated",
        "phase",
        "data_audit_complete",
        "domain_knowledge_complete",
        "causal_check_complete",
        "exploration_complete",
        "exploration_summary",
        "analysis_output",
        "report_output"
      ]),
      data_facts: /* @__PURE__ */ new Set([
        "last_updated",
        "data_checked",
        "data_sources",
        "audit_scope",
        "unit_of_observation",
        "variables",
        "structure_notes",
        "timing_notes",
        "dependency_notes",
        "leakage_risks",
        "missingness_notes",
        "support_notes",
        "validity_questions",
        "exploratory_runs",
        "artifact_refs"
      ]),
      domain_knowledge: /* @__PURE__ */ new Set([
        "last_updated",
        "domain_checked",
        "domain_scope",
        "user_provided",
        "data_facts",
        "construct_notes",
        "measurement_notes",
        "population_setting_notes",
        "domain_practice",
        "source_limitations",
        "practice_searches",
        "references"
      ]),
      causal_facts: /* @__PURE__ */ new Set([
        "last_updated",
        "causal_checked",
        "analysis_readiness",
        "causal_question",
        "exposure_or_intervention",
        "outcome",
        "estimand",
        "assumptions",
        "threats",
        "support_status",
        "recommended_checks",
        "recommended_method_routes",
        "analysis_options"
      ]),
      discovery_sidecar: /* @__PURE__ */ new Set([
        "last_updated",
        "scope_id",
        "scope_revision",
        "execution_contract",
        "status",
        "goal",
        "scope",
        "method_summary",
        "findings",
        "diagnostics",
        "limitations",
        "artifact_refs",
        "reviewer_requests"
      ]),
      report_assembly: /* @__PURE__ */ new Set([
        "last_updated",
        "scope_id",
        "scope_revision",
        "current_format",
        "report_goal",
        "audience",
        "target_section",
        "planned_structure",
        "key_points",
        "wording_constraints",
        "analysis_artifact_ids",
        "draft_notes"
      ])
    };
    var CHAMBER_KEYS = /* @__PURE__ */ new Set([
      "last_updated",
      "current_status",
      "summary",
      "questions_for_user",
      "feedback_to_route"
    ]);
    var ANALYSIS_CHAMBER_KEYS = /* @__PURE__ */ new Set([
      ...CHAMBER_KEYS,
      "scope_id",
      "scope_revision",
      "support",
      "execution_contract",
      "causal_basis_hash"
    ]);
    var StateError = class extends Error {
      constructor(code, message, details = void 0) {
        super(message);
        this.name = "StateError";
        this.code = code;
        this.details = details;
      }
    };
    function fail(code, message, details) {
      throw new StateError(code, message, details);
    }
    function isObject(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value);
    }
    function assertObject(value, label, code = "INVALID_STATE") {
      if (!isObject(value)) fail(code, `${label} must be a mapping`);
    }
    function assertArray(value, label, code = "INVALID_STATE") {
      if (!Array.isArray(value)) fail(code, `${label} must be a list`);
    }
    function assertStringOrNull(value, label, code = "INVALID_STATE") {
      if (value !== null && typeof value !== "string") {
        fail(code, `${label} must be a string or null`);
      }
    }
    function assertStringArray(value, label, code = "INVALID_STATE") {
      assertArray(value, label, code);
      if (value.some((item) => typeof item !== "string")) {
        fail(code, `${label} must contain only strings`);
      }
    }
    function assertStringArrayFields(section, fields, label) {
      for (const field of fields) assertStringArray(section[field], `${label}.${field}`);
    }
    function assertStringOrNullFields(section, fields, label) {
      for (const field of fields) assertStringOrNull(section[field], `${label}.${field}`);
    }
    function assertEnum(value, allowed, label, code = "INVALID_STATE") {
      if (!allowed.includes(value)) {
        fail(code, `${label} must be one of: ${allowed.map(String).join(", ")}`);
      }
    }
    function assertKnownKeys(value, allowed, label, code = "INVALID_STATE") {
      if (!isObject(value)) fail(code, `${label} must be a mapping`);
      const unknown = Object.keys(value).filter((key) => !allowed.has(key));
      if (unknown.length) {
        fail(code, `${label} contains unsupported fields: ${unknown.join(", ")}`);
      }
    }
    function normalizeRequiredString(value, label, code) {
      if (typeof value !== "string" || !value.trim()) {
        fail(code, `${label} must be a nonempty string`);
      }
      return value.trim();
    }
    function normalizeContractArray(value, label, code, requireItems = false) {
      assertArray(value, label, code);
      const normalized = value.map((item, index) => normalizeRequiredString(item, `${label}[${index}]`, code));
      if (requireItems && normalized.length === 0) {
        fail(code, `${label} must contain at least one item`);
      }
      if (new Set(normalized).size !== normalized.length) {
        fail(code, `${label} must not contain duplicates`);
      }
      return normalized;
    }
    function normalizeAnalysisArtifactIds(value, label, code = "INVALID_INPUT") {
      const normalized = normalizeContractArray(value, label, code);
      normalized.forEach((artifactId, index) => {
        if (!isArtifactId(artifactId)) {
          fail(code, `${label}[${index}] must be a UUID or legacy artifact id`);
        }
      });
      return normalized.sort();
    }
    function normalizeDiscoveryContract(value, label, code = "INVALID_INPUT") {
      assertKnownKeys(value, DISCOVERY_CONTRACT_KEYS, label, code);
      const missing = [...DISCOVERY_CONTRACT_KEYS].filter(
        (field) => !Object.prototype.hasOwnProperty.call(value, field)
      );
      if (missing.length) fail(code, `${label} is missing: ${missing.join(", ")}`);
      const contract = {
        target: normalizeRequiredString(value.target, `${label}.target`, code),
        input_refs: normalizeContractArray(value.input_refs, `${label}.input_refs`, code, true),
        variables: normalizeContractArray(value.variables, `${label}.variables`, code, true),
        method_plan: normalizeRequiredString(value.method_plan, `${label}.method_plan`, code),
        constraints: normalizeContractArray(value.constraints, `${label}.constraints`, code),
        diagnostic_requirements: normalizeContractArray(
          value.diagnostic_requirements,
          `${label}.diagnostic_requirements`,
          code
        ),
        output_type: normalizeRequiredString(value.output_type, `${label}.output_type`, code),
        claim_boundary: value.claim_boundary
      };
      assertEnum(contract.claim_boundary, ["candidate_only"], `${label}.claim_boundary`, code);
      return contract;
    }
    function validateDiscoveryContract(value, label, code = "INVALID_STATE") {
      const normalized = normalizeDiscoveryContract(value, label, code);
      if (!deepEqual(normalized, value)) {
        fail(code, `${label} must use trimmed canonical strings`);
      }
    }
    function normalizeAnalysisContract(value, label, code = "INVALID_INPUT") {
      assertKnownKeys(value, ANALYSIS_CONTRACT_KEYS, label, code);
      const missing = [...ANALYSIS_CONTRACT_KEYS].filter(
        (field) => !Object.prototype.hasOwnProperty.call(value, field)
      );
      if (missing.length) fail(code, `${label} is missing: ${missing.join(", ")}`);
      return {
        target: normalizeRequiredString(value.target, `${label}.target`, code),
        input_refs: normalizeContractArray(value.input_refs, `${label}.input_refs`, code, true),
        method_plan: normalizeRequiredString(value.method_plan, `${label}.method_plan`, code),
        execution_requirements: normalizeContractArray(
          value.execution_requirements,
          `${label}.execution_requirements`,
          code,
          true
        ),
        output_type: normalizeRequiredString(value.output_type, `${label}.output_type`, code),
        claim_boundary: normalizeRequiredString(value.claim_boundary, `${label}.claim_boundary`, code)
      };
    }
    function validateAnalysisContract(value, label, code = "INVALID_STATE") {
      const normalized = normalizeAnalysisContract(value, label, code);
      if (!deepEqual(normalized, value)) {
        fail(code, `${label} must use trimmed canonical strings`);
      }
    }
    function sha256Hex(value) {
      return crypto.createHash("sha256").update(value, "utf8").digest("hex");
    }
    function canonicalJson(value) {
      if (value === null || typeof value !== "object") return JSON.stringify(value);
      if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    function contractHash(scopeKind, contract) {
      return sha256Hex(JSON.stringify({ scope_kind: scopeKind, contract }));
    }
    function reportContractCandidates(reportAssembly, includeEvidenceBinding = true) {
      const base = {};
      if (includeEvidenceBinding) {
        if (reportAssembly.analysis_artifact_ids === null) {
          fail(
            "SCOPE_MISMATCH",
            "the report evidence binding is unresolved and requires scope revision"
          );
        }
        base.analysis_artifact_ids = [...reportAssembly.analysis_artifact_ids].sort();
      }
      for (const field of ["report_goal", "audience", "target_section"]) {
        const value = reportAssembly[field];
        if (typeof value === "string" && value.trim()) base[field] = value.trim();
      }
      for (const field of ["planned_structure", "key_points", "wording_constraints"]) {
        const values = reportAssembly[field].filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
        if (values.length) base[field] = values;
      }
      if (reportAssembly.current_format === null) return [base];
      return [{ ...base, current_format: reportAssembly.current_format }, base];
    }
    function requirementDescriptions(scopeKind, contract) {
      const requirements = [];
      const add = (kind, description) => {
        requirements.push({ kind, description });
      };
      const addMany = (kind, values) => values.forEach((value) => add(kind, value));
      if (scopeKind === "analysis") {
        add("target", contract.target);
        addMany("input_ref", contract.input_refs);
        add("method_plan", contract.method_plan);
        addMany("execution_requirement", contract.execution_requirements);
        add("output_type", contract.output_type);
        add("claim_boundary", contract.claim_boundary);
      } else if (scopeKind === "discovery") {
        add("target", contract.target);
        addMany("input_ref", contract.input_refs);
        addMany("variable", contract.variables);
        add("method_plan", contract.method_plan);
        addMany("constraint", contract.constraints);
        addMany("diagnostic_requirement", contract.diagnostic_requirements);
        add("output_type", contract.output_type);
        add("claim_boundary", contract.claim_boundary);
      } else if (scopeKind === "report") {
        for (const field of ["report_goal", "audience", "target_section"]) {
          if (contract[field] !== void 0) add(field, contract[field]);
        }
        for (const field of ["planned_structure", "key_points", "wording_constraints"]) {
          if (contract[field] !== void 0) addMany(field, contract[field]);
        }
        addMany("analysis_artifact_id", contract.analysis_artifact_ids ?? []);
        if (contract.current_format !== void 0) add("current_format", contract.current_format);
      }
      return requirements;
    }
    function requirementId(contractHash2, index, kind, description) {
      return `req-${sha256Hex(JSON.stringify({
        contract_hash: contractHash2,
        index,
        kind,
        description
      })).slice(0, 16)}`;
    }
    function contractBundle(scopeKind, contract) {
      const hash = contractHash(scopeKind, contract);
      const requirements = requirementDescriptions(scopeKind, contract).map((item, index) => ({
        id: requirementId(hash, index, item.kind, item.description),
        kind: item.kind,
        description: item.description
      }));
      return { hash, requirements };
    }
    function operationContractBundles(state, operation, planInfo) {
      if (operation.scope_ref === null) return [];
      if (planInfo.actor === "causal_discovery") {
        if (operation.discovery_scope === null) return [];
        return [contractBundle("discovery", operation.discovery_scope.contract)];
      }
      if (planInfo.actor && planInfo.actor.startsWith("analysis_execution.")) {
        const slot = state.council_chamber.analysis_execution[planInfo.design];
        if (!slot || slot.execution_contract === null) return [];
        return [contractBundle("analysis", slot.execution_contract)];
      }
      if (planInfo.actor === "report_writer") {
        return reportContractCandidates(
          state.report_assembly,
          operation.report_evidence_binding_protocol !== 0
        ).map((contract) => contractBundle("report", contract));
      }
      return [];
    }
    function setOperationProtocol(state, operation, planInfo) {
      const bundle = operationContractBundles(state, operation, planInfo)[0] ?? null;
      operation.completion_protocol = bundle === null ? 0 : 2;
      operation.contract_hash = bundle === null ? null : bundle.hash;
    }
    function analysisCausalBasisHash(state) {
      const sortedStrings = (items) => [...items].sort();
      const preferredOption = state.causal_facts.analysis_options.find((option) => option.role === "preferred") ?? null;
      const preferred = preferredOption === null ? null : {
        ...preferredOption,
        data_work: sortedStrings(preferredOption.data_work),
        requirements: sortedStrings(preferredOption.requirements)
      };
      const recommendations = state.causal_facts.recommended_method_routes.map((route) => ({
        ...route,
        route_cautions: sortedStrings(route.route_cautions)
      })).sort((left, right) => {
        const leftKey = `${left.category}:${left.id}`;
        const rightKey = `${right.category}:${right.id}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
      return sha256Hex(canonicalJson({
        causal_checked: state.causal_facts.causal_checked,
        analysis_readiness: state.causal_facts.analysis_readiness,
        causal_question: state.causal_facts.causal_question,
        exposure_or_intervention: state.causal_facts.exposure_or_intervention,
        outcome: state.causal_facts.outcome,
        estimand: state.causal_facts.estimand,
        assumptions: sortedStrings(state.causal_facts.assumptions),
        threats: sortedStrings(state.causal_facts.threats),
        support_status: state.causal_facts.support_status,
        recommended_checks: sortedStrings(state.causal_facts.recommended_checks),
        recommended_method_routes: recommendations,
        preferred_analysis_option: preferred
      }));
    }
    function operationPacket(state, operation, planInfo) {
      if (operation === null) return null;
      let requirements = [];
      if ([1, 2].includes(operation.completion_protocol)) {
        const bundle = operationContractBundles(state, operation, planInfo).find((candidate) => candidate.hash === operation.contract_hash);
        if (!bundle) {
          fail("SCOPE_MISMATCH", "active operation contract_hash does not match its bound scope");
        }
        requirements = bundle.requirements;
      }
      return {
        operation_id: operation.id,
        stage: operation.stage,
        action: operation.stage === "worker_pending" ? "apply" : "finish",
        actor: planInfo.actor,
        support: planInfo.support,
        intent_summary: operation.intent_summary,
        scope_ref: operation.scope_ref === null ? null : clone(operation.scope_ref),
        completion_protocol: operation.completion_protocol,
        contract_hash: operation.contract_hash,
        requirements
      };
    }
    function packetContent(packet) {
      if (packet === null) return null;
      const {
        stage: _stage,
        action: _action,
        ...content
      } = packet;
      return content;
    }
    function operationPacketResult(previousPacket, currentPacket) {
      if (currentPacket === null || !deepEqual(packetContent(previousPacket), packetContent(currentPacket))) {
        return { operation_packet: currentPacket };
      }
      return {
        operation_packet_ref: {
          operation_id: currentPacket.operation_id,
          stage: currentPacket.stage,
          action: currentPacket.action,
          completion_protocol: currentPacket.completion_protocol,
          contract_hash: currentPacket.contract_hash,
          contract_unchanged: true
        }
      };
    }
    function normalizeReceiptStringArray(value, label) {
      return normalizeContractArray(value, label, "INVALID_ARTIFACT_RECEIPT");
    }
    function normalizeEvidenceFiles(value, label) {
      const files = normalizeReceiptStringArray(value, label).map((item, index) => {
        const normalized = normalizePath(item);
        if (normalized !== item || path.posix.normalize(normalized) !== normalized || !normalized.startsWith("output/")) {
          fail("INVALID_ARTIFACT_RECEIPT", `${label}[${index}] must be a canonical project-relative output path`);
        }
        return normalized;
      });
      if (new Set(files).size !== files.length) {
        fail("INVALID_ARTIFACT_RECEIPT", `${label} must not contain duplicates`);
      }
      return files;
    }
    function normalizeRequirementEvidence(value, label) {
      assertArray(value, label, "INVALID_ARTIFACT_RECEIPT");
      const normalized = value.map((item, index) => {
        const itemLabel = `${label}[${index}]`;
        const keys = /* @__PURE__ */ new Set(["requirement_id", "file", "locator"]);
        assertKnownKeys(item, keys, itemLabel, "INVALID_ARTIFACT_RECEIPT");
        const missing = [...keys].filter((field) => !Object.prototype.hasOwnProperty.call(item, field));
        if (missing.length) fail("INVALID_ARTIFACT_RECEIPT", `${itemLabel} is missing: ${missing.join(", ")}`);
        const locator = normalizeRequiredString(item.locator, `${itemLabel}.locator`, "INVALID_ARTIFACT_RECEIPT").replace(/\r\n?/g, "\n");
        if (locator.includes("\n") || locator.length > MAX_EVIDENCE_LOCATOR_LENGTH) {
          fail("INVALID_ARTIFACT_RECEIPT", `${itemLabel}.locator must be a single line of at most ${MAX_EVIDENCE_LOCATOR_LENGTH} characters`);
        }
        return {
          requirement_id: normalizeRequiredString(item.requirement_id, `${itemLabel}.requirement_id`, "INVALID_ARTIFACT_RECEIPT"),
          file: normalizeEvidenceFiles([item.file], `${itemLabel}.file`)[0],
          locator
        };
      });
      const ids = normalized.map((item) => item.requirement_id);
      if (new Set(ids).size !== ids.length) {
        fail("INVALID_ARTIFACT_RECEIPT", `${label} must not contain duplicate requirement IDs`);
      }
      return normalized;
    }
    function normalizeReceiptDeviations(value, label) {
      if (value === void 0) return [];
      assertArray(value, label, "INVALID_ARTIFACT_RECEIPT");
      if (value.length > MAX_RECEIPT_DEVIATIONS) {
        fail("INVALID_ARTIFACT_RECEIPT", `${label} may contain at most ${MAX_RECEIPT_DEVIATIONS} items`);
      }
      const normalized = value.map((item, index) => {
        const text = normalizeRequiredString(item, `${label}[${index}]`, "INVALID_ARTIFACT_RECEIPT").replace(/\r\n?/g, "\n");
        if (text.includes("\n") || text.length > MAX_EVIDENCE_LOCATOR_LENGTH) {
          fail("INVALID_ARTIFACT_RECEIPT", `${label}[${index}] must be a single line of at most ${MAX_EVIDENCE_LOCATOR_LENGTH} characters`);
        }
        return text;
      });
      if (new Set(normalized).size !== normalized.length) {
        fail("INVALID_ARTIFACT_RECEIPT", `${label} must not contain duplicates`);
      }
      return normalized;
    }
    function normalizeExecutionReceipt(value, label = "artifact.execution_receipt", receiptVersion = null) {
      assertObject(value, label, "INVALID_ARTIFACT_RECEIPT");
      const selectedVersion = receiptVersion ?? (Object.prototype.hasOwnProperty.call(value, "requirement_evidence") || Object.prototype.hasOwnProperty.call(value, "deviations") ? MANIFEST_VERSION : RECEIPT_MANIFEST_VERSION);
      const keys = selectedVersion === RECEIPT_MANIFEST_VERSION ? LEGACY_EXECUTION_RECEIPT_KEYS : EXECUTION_RECEIPT_KEYS;
      assertKnownKeys(value, keys, label, "INVALID_ARTIFACT_RECEIPT");
      const requiredKeys = selectedVersion === RECEIPT_MANIFEST_VERSION ? [...LEGACY_EXECUTION_RECEIPT_KEYS] : [...EXECUTION_RECEIPT_KEYS].filter((field) => field !== "deviations");
      const missing = requiredKeys.filter(
        (field) => !Object.prototype.hasOwnProperty.call(value, field)
      );
      if (missing.length) {
        fail("INVALID_ARTIFACT_RECEIPT", `${label} is missing: ${missing.join(", ")}`);
      }
      if (typeof value.contract_hash !== "string" || !/^[0-9a-f]{64}$/.test(value.contract_hash)) {
        fail("INVALID_ARTIFACT_RECEIPT", `${label}.contract_hash must be a lowercase SHA-256 hex digest`);
      }
      const receipt = {
        contract_hash: value.contract_hash,
        completed_requirements: normalizeReceiptStringArray(
          value.completed_requirements,
          `${label}.completed_requirements`
        ),
        unmet_requirements: normalizeReceiptStringArray(
          value.unmet_requirements,
          `${label}.unmet_requirements`
        ),
        supplemental_work: normalizeReceiptStringArray(
          value.supplemental_work,
          `${label}.supplemental_work`
        ),
        evidence_files: normalizeEvidenceFiles(value.evidence_files, `${label}.evidence_files`)
      };
      const completed = new Set(receipt.completed_requirements);
      const unmet = new Set(receipt.unmet_requirements);
      if ([...completed].some((id) => unmet.has(id))) {
        fail("INVALID_ARTIFACT_RECEIPT", "completed_requirements and unmet_requirements must not overlap");
      }
      if (!receipt.evidence_files.length) {
        fail("INVALID_ARTIFACT_RECEIPT", "execution_receipt.evidence_files must identify at least one evidence file");
      }
      if (selectedVersion === MANIFEST_VERSION) {
        receipt.requirement_evidence = normalizeRequirementEvidence(
          value.requirement_evidence,
          `${label}.requirement_evidence`
        );
        receipt.deviations = normalizeReceiptDeviations(value.deviations, `${label}.deviations`);
        const completed2 = new Set(receipt.completed_requirements);
        const mapped = new Set(receipt.requirement_evidence.map((item) => item.requirement_id));
        if (mapped.size !== completed2.size || [...completed2].some((id) => !mapped.has(id))) {
          fail("INVALID_ARTIFACT_RECEIPT", "requirement_evidence must contain exactly one entry per completed requirement");
        }
        const evidenceFiles = new Set(receipt.evidence_files);
        if (receipt.requirement_evidence.some((item) => !evidenceFiles.has(item.file))) {
          fail("INVALID_ARTIFACT_RECEIPT", "requirement_evidence files must also appear in evidence_files");
        }
      }
      return receipt;
    }
    function normalizeManifestRequirements(value, contractHash2, label = "artifact manifest.requirements", code = "INVALID_ARTIFACT_MANIFEST") {
      assertArray(value, label, code);
      if (contractHash2 === null && value.length) {
        fail(code, `${label} must be empty when the manifest has no bound contract`);
      }
      const keys = /* @__PURE__ */ new Set(["id", "kind", "description"]);
      const normalized = value.map((item, index) => {
        const itemLabel = `${label}[${index}]`;
        assertKnownKeys(item, keys, itemLabel, code);
        const missing = [...keys].filter(
          (field) => !Object.prototype.hasOwnProperty.call(item, field)
        );
        if (missing.length) {
          fail(code, `${itemLabel} is missing: ${missing.join(", ")}`);
        }
        const requirement = {
          id: normalizeRequiredString(item.id, `${itemLabel}.id`, code),
          kind: normalizeRequiredString(item.kind, `${itemLabel}.kind`, code),
          description: normalizeRequiredString(
            item.description,
            `${itemLabel}.description`,
            code
          )
        };
        if (!/^req-[0-9a-f]{16}$/.test(requirement.id)) {
          fail(code, `${itemLabel}.id must be a canonical requirement ID`);
        }
        if (!REQUIREMENT_KINDS.has(requirement.kind)) {
          fail(code, `${itemLabel}.kind is not a supported requirement kind`);
        }
        if (contractHash2 !== null) {
          const expectedId = requirementId(
            contractHash2,
            index,
            requirement.kind,
            requirement.description
          );
          if (requirement.id !== expectedId) {
            fail(code, `${itemLabel}.id does not match its contract, order, kind, and description`);
          }
        }
        return requirement;
      });
      const ids = normalized.map((item) => item.id);
      if (new Set(ids).size !== ids.length) {
        fail(code, `${label} must not contain duplicate requirement IDs`);
      }
      return normalized;
    }
    function validateReceiptAgainstPacket(receipt, packet, artifactRole, files = null) {
      if (packet.completion_protocol === 0) {
        if (receipt !== null) {
          fail("INVALID_ARTIFACT_RECEIPT", "completion protocol 0 does not accept an execution_receipt");
        }
        if (artifactRole !== "completion") {
          fail("SCOPE_MISMATCH", "infeasibility evidence requires a bound completion protocol");
        }
        return;
      }
      if (receipt === null) {
        fail("INVALID_ARTIFACT_RECEIPT", `completion protocol ${packet.completion_protocol} requires an execution_receipt`);
      }
      if (receipt.contract_hash !== packet.contract_hash) {
        fail("SCOPE_MISMATCH", "execution_receipt.contract_hash does not match the bound contract");
      }
      if (packet.completion_protocol === 2 && !Object.prototype.hasOwnProperty.call(receipt, "requirement_evidence")) {
        fail("INVALID_ARTIFACT_RECEIPT", "completion protocol 2 requires requirement_evidence");
      }
      const required = packet.requirements.map((item) => item.id);
      const requiredSet = new Set(required);
      const completed = new Set(receipt.completed_requirements);
      const unmet = new Set(receipt.unmet_requirements);
      if ([...completed, ...unmet].some((id) => !requiredSet.has(id))) {
        fail("INVALID_ARTIFACT_RECEIPT", "requirement IDs outside the operation packet belong in supplemental_work");
      }
      if (artifactRole === "completion") {
        const missing = required.filter((id) => !completed.has(id));
        if (missing.length || unmet.size) {
          fail("INCOMPLETE_WORK", "completion requires every operation-packet requirement and no unmet requirements", {
            missing_requirements: missing,
            unmet_requirements: [...unmet]
          });
        }
      } else {
        if (!unmet.size) {
          fail("INVALID_ARTIFACT_RECEIPT", "infeasibility evidence requires at least one unmet requirement");
        }
        if (required.some((id) => !completed.has(id) && !unmet.has(id))) {
          fail("INVALID_ARTIFACT_RECEIPT", "infeasibility evidence requires full required-set accounting");
        }
      }
      if (files !== null) {
        const inventory = new Set(files.map(normalizePath));
        if (receipt.evidence_files.some((file) => !inventory.has(file))) {
          fail("INVALID_ARTIFACT_RECEIPT", "execution_receipt evidence_files must be listed in the artifact manifest");
        }
        if (receipt.requirement_evidence && receipt.requirement_evidence.some((item) => !inventory.has(item.file))) {
          fail("INVALID_ARTIFACT_RECEIPT", "requirement_evidence files must be listed in the artifact manifest");
        }
      }
    }
    function assertExactTopLevel(state, expected = REQUIRED_TOP_LEVEL) {
      assertObject(state, "project state");
      const missing = expected.filter((key) => !(key in state));
      if (missing.length) fail("INVALID_STATE", `missing top-level sections: ${missing.join(", ")}`);
      const extra = Object.keys(state).filter((key) => !expected.includes(key));
      if (extra.length) fail("INVALID_STATE", `unsupported top-level sections: ${extra.join(", ")}`);
    }
    function normalizeResponseText(value, label, singleLine = false, maxLength = MAX_RESPONSE_TEXT_LENGTH) {
      if (typeof value !== "string" || !value.trim()) {
        fail("INVALID_INPUT", `${label} must be a nonempty string`);
      }
      const normalized = value.replace(/\r\n?/g, "\n").trim();
      if (normalized.length > maxLength) {
        fail("INVALID_INPUT", `${label} must contain at most ${maxLength} characters`);
      }
      if (singleLine && normalized.includes("\n")) {
        fail("INVALID_INPUT", `${label} must be a single line`);
      }
      if (normalized.split("\n").some((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith("[Causal-Consultant Loaded]") || [...RESPONSE_HEADINGS].some((heading) => trimmed.startsWith(heading));
      })) {
        fail("INVALID_INPUT", `${label} must not contain a response heading`);
      }
      return normalized;
    }
    function isUuid(value) {
      return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }
    function isArtifactId(value) {
      return isUuid(value) || typeof value === "string" && /^legacy-\d{4}$/.test(value);
    }
    function isTimestamp(value) {
      if (typeof value !== "string") return false;
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
    }
    function nowIso() {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
    function normalizePath(value) {
      return String(value).replace(/\\/g, "/");
    }
    function parseYaml(text, label = STATE_FILE) {
      let document;
      try {
        document = YAML.parseDocument(text, {
          schema: "core",
          uniqueKeys: true,
          maxAliasCount: 50,
          prettyErrors: true
        });
      } catch (error) {
        fail("INVALID_YAML", `${label} could not be parsed: ${error.message}`);
      }
      if (document.errors.length) {
        fail("INVALID_YAML", `${label} could not be parsed: ${document.errors.map((error) => error.message).join("; ")}`);
      }
      try {
        return document.toJS({ maxAliasCount: 50 });
      } catch (error) {
        fail("INVALID_YAML", `${label} could not be converted safely: ${error.message}`);
      }
    }
    function stringifyYaml(value) {
      return YAML.stringify(value, {
        lineWidth: 0,
        defaultKeyType: "PLAIN",
        defaultStringType: "QUOTE_DOUBLE"
      });
    }
    function readBytes(filePath) {
      try {
        return fs.readFileSync(filePath);
      } catch (error) {
        fail("IO_ERROR", `could not read ${filePath}: ${error.message}`);
      }
    }
    function readText(filePath) {
      return readBytes(filePath).toString("utf8");
    }
    function atomicWrite(filePath, text, temporaryDirectory = null) {
      const directory = path.dirname(filePath);
      fs.mkdirSync(directory, { recursive: true });
      const tempRoot = temporaryDirectory === null ? directory : temporaryDirectory;
      fs.mkdirSync(tempRoot, { recursive: true });
      const tempPath = path.join(tempRoot, `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`);
      let handle;
      try {
        handle = fs.openSync(tempPath, "wx", 384);
        fs.writeFileSync(handle, text, "utf8");
        fs.fsyncSync(handle);
        fs.closeSync(handle);
        handle = void 0;
        if (process.env.STATECTL_FAIL_BEFORE_RENAME === "1" && path.basename(filePath) === STATE_FILE) {
          fail("INJECTED_WRITE_FAILURE", "injected failure before atomic replacement");
        }
        fs.renameSync(tempPath, filePath);
      } catch (error) {
        if (handle !== void 0) {
          try {
            fs.closeSync(handle);
          } catch (_closeError) {
          }
        }
        try {
          fs.rmSync(tempPath, { force: true });
        } catch (_removeError) {
        }
        if (error instanceof StateError) throw error;
        fail("IO_ERROR", `could not atomically write ${filePath}: ${error.message}`);
      }
    }
    function archiveBytes(projectRoot, bytes, reason) {
      const directory = path.join(projectRoot, ARCHIVE_DIR);
      fs.mkdirSync(directory, { recursive: true });
      const stamp = nowIso().replace(/[-:.]/g, "");
      const archivePath = path.join(directory, `${stamp}-${reason}-${crypto.randomUUID().slice(0, 8)}.yaml`);
      let handle;
      try {
        handle = fs.openSync(archivePath, "wx", 384);
        fs.writeFileSync(handle, bytes);
        fs.fsyncSync(handle);
        fs.closeSync(handle);
        return archivePath;
      } catch (error) {
        if (handle !== void 0) {
          try {
            fs.closeSync(handle);
          } catch (_closeError) {
          }
        }
        try {
          fs.rmSync(archivePath, { force: true });
        } catch (_removeError) {
        }
        fail("IO_ERROR", `could not archive existing project state: ${error.message}`);
      }
    }
    function clone(value) {
      return structuredClone(value);
    }
    function deepMerge(target, patch) {
      if (!isObject(patch)) return clone(patch);
      const output = isObject(target) ? clone(target) : {};
      for (const [key, value] of Object.entries(patch)) {
        output[key] = isObject(value) ? deepMerge(output[key], value) : clone(value);
      }
      return output;
    }
    function deepEqual(left, right) {
      return isDeepStrictEqual(left, right);
    }
    function hasDuplicateAssignments(options) {
      return options.some((option, index) => options.slice(0, index).some((previous) => deepEqual(previous.assignment, option.assignment)));
    }
    function validatePlan(plan) {
      assertArray(plan, "next_step_plan");
      if (plan.length === 0) return { kind: "idle", actor: null, design: null, support: null };
      if (plan.length === 1) {
        assertKnownKeys(plan[0], /* @__PURE__ */ new Set(["id"]), "next_step_plan[0]");
        if (plan[0].id !== "team_lead") fail("PLAN_MISMATCH", "a one-entry plan must contain only team_lead");
        return { kind: "lead", actor: "team_lead", design: null, support: null };
      }
      if (plan.length !== 2) fail("PLAN_MISMATCH", "a nonempty plan must contain one or two entries");
      assertObject(plan[0], "next_step_plan[0]");
      assertKnownKeys(plan[1], /* @__PURE__ */ new Set(["id"]), "next_step_plan[1]");
      if (plan[1].id !== "team_lead") fail("PLAN_MISMATCH", "team_lead must be the final plan entry");
      const route = plan[0].id;
      if (CORE_WORKERS.has(route)) {
        assertKnownKeys(plan[0], /* @__PURE__ */ new Set(["id"]), "next_step_plan[0]");
        return { kind: "worker", actor: route, design: null, support: null };
      }
      if (typeof route === "string" && route.startsWith("analysis_execution.")) {
        assertKnownKeys(plan[0], /* @__PURE__ */ new Set(["id", "support"]), "next_step_plan[0]");
        const design = route.slice("analysis_execution.".length);
        if (!DESIGN_IDS.has(design)) fail("PLAN_MISMATCH", `unknown analysis design route: ${design}`);
        const support = plan[0].support ?? null;
        if (support !== null && !SUPPORT_IDS.has(support)) fail("PLAN_MISMATCH", `unknown analysis support route: ${support}`);
        return { kind: "worker", actor: route, design, support };
      }
      fail("PLAN_MISMATCH", `unknown planned route: ${route}`);
    }
    function validateScopeRef(value, label = "scope_ref", code = "INVALID_STATE") {
      if (value === null) return;
      assertKnownKeys(value, /* @__PURE__ */ new Set(["kind", "id", "revision"]), label, code);
      assertEnum(value.kind, ["analysis", "report", "discovery"], `${label}.kind`, code);
      if (!isUuid(value.id)) fail(code, `${label}.id must be a UUID`);
      if (!Number.isInteger(value.revision) || value.revision < 1) {
        fail(code, `${label}.revision must be a positive integer`);
      }
    }
    function validateStartupNotice(notice, templateMode) {
      if (notice === null) return;
      if (templateMode) fail("INVALID_STATE", "the bundled template must leave state_meta.startup_notice null");
      assertKnownKeys(notice, /* @__PURE__ */ new Set(["kind", "archive_path"]), "state_meta.startup_notice");
      if (!Object.prototype.hasOwnProperty.call(notice, "kind") || !Object.prototype.hasOwnProperty.call(notice, "archive_path")) {
        fail("INVALID_STATE", "state_meta.startup_notice requires kind and archive_path");
      }
      assertEnum(notice.kind, ["created", "reset"], "state_meta.startup_notice.kind");
      if (notice.kind === "created") {
        if (notice.archive_path !== null) {
          fail("INVALID_STATE", "a created startup notice must have a null archive_path");
        }
        return;
      }
      if (typeof notice.archive_path !== "string") {
        fail("INVALID_STATE", "a reset startup notice requires an archive_path");
      }
      const normalized = normalizePath(notice.archive_path);
      if (normalized !== notice.archive_path || normalized.includes("\0") || path.posix.normalize(normalized) !== normalized || !normalized.startsWith(`${ARCHIVE_DIR}/`) || normalized === `${ARCHIVE_DIR}/`) {
        fail("INVALID_STATE", `state_meta.startup_notice.archive_path must be a canonical path under ${ARCHIVE_DIR}/`);
      }
    }
    function validateDiscoveryScopeSnapshot(value, label, code = "INVALID_STATE") {
      if (value === null) return;
      assertKnownKeys(value, /* @__PURE__ */ new Set(["transition", "base_ref", "contract"]), label, code);
      const missing = ["transition", "base_ref", "contract"].filter(
        (field) => !Object.prototype.hasOwnProperty.call(value, field)
      );
      if (missing.length) fail(code, `${label} is missing: ${missing.join(", ")}`);
      assertEnum(value.transition, ["new", "revise", "preserve"], `${label}.transition`, code);
      validateScopeRef(value.base_ref, `${label}.base_ref`, code);
      if (value.base_ref !== null && value.base_ref.kind !== "discovery") {
        fail(code, `${label}.base_ref must be a discovery scope reference`);
      }
      if (value.transition === "new" && value.base_ref !== null) {
        fail(code, `${label}.base_ref must be null for a new scope`);
      }
      if (value.transition !== "new" && value.base_ref === null) {
        fail(code, `${label}.base_ref is required for ${value.transition}`);
      }
      validateDiscoveryContract(value.contract, `${label}.contract`, code);
    }
    function validateActiveOperation(meta, planInfo) {
      const operation = meta.active_operation;
      if (operation === null) {
        if (planInfo.kind !== "idle") fail("PLAN_MISMATCH", "a nonempty plan requires state_meta.active_operation");
        return;
      }
      assertKnownKeys(operation, /* @__PURE__ */ new Set([
        "id",
        "stage",
        "intent_summary",
        "scope_ref",
        "artifact_intent",
        "discovery_scope",
        "completion_protocol",
        "contract_hash",
        "report_evidence_binding_protocol",
        "started_at"
      ]), "state_meta.active_operation");
      if (!isUuid(operation.id)) fail("INVALID_STATE", "active_operation.id must be a UUID");
      assertEnum(operation.stage, ["worker_pending", "lead_pending"], "active_operation.stage");
      if (typeof operation.intent_summary !== "string" || !operation.intent_summary.trim() || operation.intent_summary.length > MAX_INTENT_LENGTH) {
        fail("INVALID_STATE", `active_operation.intent_summary must contain 1-${MAX_INTENT_LENGTH} characters`);
      }
      validateScopeRef(operation.scope_ref);
      if (!Object.prototype.hasOwnProperty.call(operation, "discovery_scope")) {
        fail("INVALID_STATE", "active_operation.discovery_scope is required");
      }
      if (!Object.prototype.hasOwnProperty.call(operation, "report_evidence_binding_protocol")) {
        fail("INVALID_STATE", "active_operation.report_evidence_binding_protocol is required");
      }
      validateDiscoveryScopeSnapshot(operation.discovery_scope, "active_operation.discovery_scope");
      if (planInfo.actor === "report_writer") {
        if (![0, 1].includes(operation.report_evidence_binding_protocol)) {
          fail("INVALID_STATE", "active report operation requires evidence-binding protocol 0 or 1");
        }
      } else if (operation.report_evidence_binding_protocol !== null) {
        fail("INVALID_STATE", "non-report operation requires null report_evidence_binding_protocol");
      }
      if (![0, 1, 2].includes(operation.completion_protocol)) {
        fail("INVALID_STATE", "active_operation.completion_protocol must be 0, 1, or 2");
      }
      if (operation.completion_protocol === 0 && operation.contract_hash !== null) {
        fail("INVALID_STATE", "completion protocol 0 requires a null contract_hash");
      }
      if ([1, 2].includes(operation.completion_protocol) && (typeof operation.contract_hash !== "string" || !/^[0-9a-f]{64}$/.test(operation.contract_hash))) {
        fail("INVALID_STATE", "bound completion protocols require a lowercase SHA-256 contract_hash");
      }
      const isDiscovery = planInfo.actor === "causal_discovery";
      if (operation.discovery_scope !== null) {
        if (!isDiscovery || operation.scope_ref === null || operation.scope_ref.kind !== "discovery") {
          fail("SCOPE_MISMATCH", "active discovery_scope requires the causal_discovery route and a discovery scope_ref");
        }
      } else if (operation.scope_ref !== null && operation.scope_ref.kind === "discovery") {
        fail("SCOPE_MISMATCH", "an active discovery scope_ref requires discovery_scope");
      }
      if (!isTimestamp(operation.started_at)) fail("INVALID_STATE", "active_operation.started_at must be an RFC3339 UTC timestamp");
      if (operation.artifact_intent !== null) {
        assertKnownKeys(operation.artifact_intent, /* @__PURE__ */ new Set(["kind", "location"]), "active_operation.artifact_intent");
        assertEnum(operation.artifact_intent.kind, ["file", "directory"], "active_operation.artifact_intent.kind");
        if (typeof operation.artifact_intent.location !== "string" || !operation.artifact_intent.location.startsWith("output/")) {
          fail("INVALID_STATE", "active_operation.artifact_intent.location must be under output/");
        }
      }
      if (planInfo.kind === "idle") fail("PLAN_MISMATCH", "active_operation requires a nonempty plan");
      if (planInfo.kind === "lead" && operation.stage !== "lead_pending") {
        fail("PLAN_MISMATCH", "team-lead-only operations must be lead_pending");
      }
    }
    function validateActiveScopeBinding(state, planInfo) {
      const operation = state.state_meta.active_operation;
      if (!operation) return;
      if (planInfo.actor === "causal_discovery") {
        if (operation.scope_ref === null) return;
        if (operation.scope_ref.kind !== "discovery" || operation.discovery_scope === null) {
          fail("SCOPE_MISMATCH", "active causal_discovery scope binding is invalid");
        }
        const snapshot = operation.discovery_scope;
        const current = state.discovery_sidecar;
        if (operation.stage === "worker_pending") {
          if (snapshot.transition === "new") {
            if (operation.scope_ref.revision !== 1) {
              fail("SCOPE_MISMATCH", "a new discovery scope must start at revision 1");
            }
            return;
          }
          if (current.scope_id !== snapshot.base_ref.id || current.scope_revision !== snapshot.base_ref.revision) {
            fail("SCOPE_MISMATCH", "active discovery scope no longer matches its durable base");
          }
          if (snapshot.transition === "preserve" && (!deepEqual(operation.scope_ref, snapshot.base_ref) || !deepEqual(current.execution_contract, snapshot.contract))) {
            fail("SCOPE_MISMATCH", "preserved discovery scope does not match its base");
          }
          if (snapshot.transition === "revise" && (operation.scope_ref.id !== snapshot.base_ref.id || operation.scope_ref.revision !== snapshot.base_ref.revision + 1)) {
            fail("SCOPE_MISMATCH", "revised discovery scope_ref is not the next base revision");
          }
          return;
        }
        if (current.scope_id !== operation.scope_ref.id || current.scope_revision !== operation.scope_ref.revision || !deepEqual(current.execution_contract, snapshot.contract) || !["scoped", "artifact_created", "reviewed", "blocked"].includes(current.status)) {
          fail("SCOPE_MISMATCH", "completed discovery handoff does not match its active scope");
        }
        return;
      }
      if (operation.scope_ref === null) return;
      let scope;
      let status;
      if (planInfo.actor && planInfo.actor.startsWith("analysis_execution.")) {
        if (operation.scope_ref.kind !== "analysis") fail("SCOPE_MISMATCH", "active analysis route has a non-analysis scope_ref");
        const design = planInfo.actor.slice("analysis_execution.".length);
        scope = state.council_chamber.analysis_execution[design];
        status = scope && scope.current_status;
        if (scope && scope.support !== planInfo.support) {
          fail("SCOPE_MISMATCH", "active analysis scope support does not match the planned support route");
        }
        if (scope && (scope.causal_basis_hash === null || scope.causal_basis_hash !== analysisCausalBasisHash(state))) {
          fail("SCOPE_MISMATCH", "active analysis scope no longer matches its causal basis");
        }
      } else if (planInfo.actor === "report_writer") {
        if (operation.scope_ref.kind !== "report") fail("SCOPE_MISMATCH", "active report route has a non-report scope_ref");
        scope = state.report_assembly;
        status = state.council_chamber.report_writer.current_status;
      } else {
        fail("SCOPE_MISMATCH", "active scope_ref is not valid for the planned route");
      }
      if (!scope || scope.scope_id !== operation.scope_ref.id || scope.scope_revision !== operation.scope_ref.revision) {
        fail("SCOPE_MISMATCH", "active scope_ref does not match the planned route's live scope");
      }
      if (operation.stage === "worker_pending" && status !== "ready") {
        fail("SCOPE_MISMATCH", "worker_pending approved scope must remain ready");
      }
      if (operation.stage === "lead_pending" && !["ready", "blocked", "done"].includes(status)) {
        fail("SCOPE_MISMATCH", "lead_pending scope must have a completed worker handoff status");
      }
    }
    function validateChamberSlot(slot, label, analysis = false, templateMode = false) {
      const allowed = analysis ? ANALYSIS_CHAMBER_KEYS : CHAMBER_KEYS;
      assertKnownKeys(slot, allowed, label);
      assertStringOrNull(slot.last_updated, `${label}.last_updated`);
      if (analysis) {
        assertEnum(slot.current_status, [null, "requested", "ready", "blocked", "done"], `${label}.current_status`);
        if (slot.support !== null && !SUPPORT_IDS.has(slot.support)) fail("INVALID_STATE", `${label}.support is not a valid support route`);
        const hasIdentity = isUuid(slot.scope_id) && Number.isInteger(slot.scope_revision) && slot.scope_revision >= 1;
        const emptyIdentity = slot.scope_id === null && slot.scope_revision === 0;
        if (!hasIdentity && !emptyIdentity) fail("INVALID_STATE", `${label} has an invalid scope identity`);
        if (!templateMode && slot.current_status !== null && slot.current_status !== "requested" && !hasIdentity) {
          fail("INVALID_STATE", `${label} requires scope identity for status ${slot.current_status}`);
        }
        if (!Object.prototype.hasOwnProperty.call(slot, "execution_contract")) {
          fail("INVALID_STATE", `${label}.execution_contract is required`);
        }
        if (slot.execution_contract !== null) {
          validateAnalysisContract(slot.execution_contract, `${label}.execution_contract`);
        }
        if (!Object.prototype.hasOwnProperty.call(slot, "causal_basis_hash")) {
          fail("INVALID_STATE", `${label}.causal_basis_hash is required`);
        }
        if (slot.causal_basis_hash !== null && (typeof slot.causal_basis_hash !== "string" || !/^[a-f0-9]{64}$/.test(slot.causal_basis_hash))) {
          fail("INVALID_STATE", `${label}.causal_basis_hash must be null or a SHA-256 hex digest`);
        }
      } else {
        assertStringOrNull(slot.current_status, `${label}.current_status`);
      }
      assertStringOrNull(slot.summary, `${label}.summary`);
      assertStringArray(slot.questions_for_user, `${label}.questions_for_user`);
      assertStringArray(slot.feedback_to_route, `${label}.feedback_to_route`);
    }
    function validateArtifactRecord(record, index) {
      const label = `artifact_records[${index}]`;
      assertKnownKeys(record, /* @__PURE__ */ new Set([
        "artifact_id",
        "operation_id",
        "route",
        "location",
        "created_at",
        "summary",
        "design",
        "support",
        "artifact_role"
      ]), label);
      const required = ["artifact_id", "operation_id", "route", "location", "created_at", "summary", "artifact_role"];
      const missing = required.filter((key) => !(key in record));
      if (missing.length) fail("INVALID_STATE", `${label} is missing: ${missing.join(", ")}`);
      const legacy = typeof record.artifact_id === "string" && /^legacy-\d{4}$/.test(record.artifact_id);
      if (!isArtifactId(record.artifact_id)) fail("INVALID_STATE", `${label}.artifact_id must be a UUID or legacy id`);
      if (legacy) {
        if (record.operation_id !== null) fail("INVALID_STATE", `${label}.operation_id must be null for legacy records`);
      } else if (!isUuid(record.operation_id)) {
        fail("INVALID_STATE", `${label}.operation_id must be a UUID`);
      }
      assertEnum(record.route, ["data_audit", "causal_discovery", "analysis_execution", "report_writer"], `${label}.route`);
      if (typeof record.location !== "string" || !normalizePath(record.location).startsWith("output/")) {
        fail("INVALID_STATE", `${label}.location must be under output/`);
      }
      if (typeof record.created_at !== "string") fail("INVALID_STATE", `${label}.created_at must be a string`);
      if (!legacy && !isTimestamp(record.created_at)) fail("INVALID_STATE", `${label}.created_at must be an RFC3339 UTC timestamp`);
      if (typeof record.summary !== "string" || !record.summary.trim()) fail("INVALID_STATE", `${label}.summary must be nonempty`);
      assertEnum(record.artifact_role, ARTIFACT_ROLES, `${label}.artifact_role`);
      if (record.design !== void 0 && !DESIGN_IDS.has(record.design)) fail("INVALID_STATE", `${label}.design is invalid`);
      if (record.support !== void 0 && record.support !== null && !SUPPORT_IDS.has(record.support)) fail("INVALID_STATE", `${label}.support is invalid`);
      if (record.route === "analysis_execution") {
        if (!DESIGN_IDS.has(record.design)) fail("INVALID_STATE", `${label}.design is required for analysis output`);
        if (!("support" in record)) fail("INVALID_STATE", `${label}.support is required for analysis output`);
      } else if (record.design !== void 0 || record.support !== void 0) {
        fail("INVALID_STATE", `${label} may use design/support only for analysis_execution`);
      }
    }
    function validateAnalysisOptions(options) {
      assertArray(options, "causal_facts.analysis_options");
      if (options.length > MAX_ANALYSIS_OPTIONS) {
        fail("INVALID_STATE", `causal_facts.analysis_options may contain at most ${MAX_ANALYSIS_OPTIONS} strategies`);
      }
      const required = /* @__PURE__ */ new Set([
        "role",
        "target",
        "approach",
        "data_work",
        "requirements",
        "main_risk",
        "prefer_when"
      ]);
      const allowed = /* @__PURE__ */ new Set([...required, "design", "support"]);
      options.forEach((option, index) => {
        const label = `causal_facts.analysis_options[${index}]`;
        assertKnownKeys(option, allowed, label);
        const missing = [...required].filter((field) => !Object.prototype.hasOwnProperty.call(option, field));
        if (missing.length) fail("INVALID_STATE", `${label} is missing: ${missing.join(", ")}`);
        assertEnum(option.role, ["preferred", "alternative", "fallback"], `${label}.role`);
        let totalTextLength = 0;
        for (const field of ["target", "approach", "main_risk", "prefer_when"]) {
          if (typeof option[field] !== "string" || !option[field].trim()) {
            fail("INVALID_STATE", `${label}.${field} must be a nonempty string`);
          }
          if (option[field] !== option[field].trim()) {
            fail("INVALID_STATE", `${label}.${field} must use a trimmed canonical string`);
          }
          if (option[field].length > MAX_ANALYSIS_OPTION_TEXT_LENGTH) {
            fail("INVALID_STATE", `${label}.${field} may contain at most ${MAX_ANALYSIS_OPTION_TEXT_LENGTH} characters`);
          }
          totalTextLength += option[field].length;
        }
        for (const field of ["data_work", "requirements"]) {
          const normalized = normalizeContractArray(option[field], `${label}.${field}`, "INVALID_STATE");
          if (!deepEqual(normalized, option[field])) {
            fail("INVALID_STATE", `${label}.${field} must use trimmed canonical strings`);
          }
          if (normalized.length > MAX_ANALYSIS_OPTION_LIST_ITEMS) {
            fail("INVALID_STATE", `${label}.${field} may contain at most ${MAX_ANALYSIS_OPTION_LIST_ITEMS} items`);
          }
          if (normalized.some((item) => item.length > MAX_ANALYSIS_OPTION_TEXT_LENGTH)) {
            fail("INVALID_STATE", `${label}.${field} items may contain at most ${MAX_ANALYSIS_OPTION_TEXT_LENGTH} characters`);
          }
          totalTextLength += normalized.reduce((sum, item) => sum + item.length, 0);
        }
        if (totalTextLength > MAX_ANALYSIS_OPTION_TOTAL_TEXT_LENGTH) {
          fail("INVALID_STATE", `${label} may contain at most ${MAX_ANALYSIS_OPTION_TOTAL_TEXT_LENGTH} characters across its decision text`);
        }
        if (Object.prototype.hasOwnProperty.call(option, "design") && !DESIGN_IDS.has(option.design)) {
          fail("INVALID_STATE", `${label}.design is not a valid design route`);
        }
        if (Object.prototype.hasOwnProperty.call(option, "support") && !SUPPORT_IDS.has(option.support)) {
          fail("INVALID_STATE", `${label}.support is not a valid support route`);
        }
        if (Object.prototype.hasOwnProperty.call(option, "support") && !Object.prototype.hasOwnProperty.call(option, "design")) {
          fail("INVALID_STATE", `${label}.support requires a design route`);
        }
      });
      if (options.filter((option) => option.role === "preferred").length > 1) {
        fail("INVALID_STATE", "causal_facts.analysis_options may contain at most one preferred strategy");
      }
      if (options.filter((option) => option.role !== "preferred").length > 2) {
        fail("INVALID_STATE", "causal_facts.analysis_options may contain at most two nonpreferred strategies");
      }
    }
    function validateAnalysisPortfolioConsistency(causalFacts) {
      const options = causalFacts.analysis_options;
      if (options.length === 0) return;
      const recommendations = causalFacts.recommended_method_routes;
      const design = recommendations.find((route) => route.category === "design")?.id ?? null;
      const support = recommendations.find((route) => route.category === "support")?.id ?? null;
      const preferred = options.filter((option) => option.role === "preferred");
      if (["ready", "limited"].includes(causalFacts.analysis_readiness)) {
        if (preferred.length !== 1 || preferred[0].design !== design || (preferred[0].support ?? null) !== support) {
          fail(
            "INVALID_STATE",
            "an actionable analysis portfolio must have one preferred strategy matching the recommended design and support"
          );
        }
      } else {
        if (preferred.length) {
          fail("INVALID_STATE", "a nonactionable analysis portfolio cannot contain a preferred strategy");
        }
        if (recommendations.length) {
          fail("INVALID_STATE", "nonactionable analysis readiness requires empty method recommendations");
        }
      }
    }
    function validatePendingDecision(state, planInfo) {
      const decision = state.pending_decision;
      if (decision === null) return;
      if (planInfo.kind !== "idle" || state.state_meta.active_operation !== null) {
        fail("INVALID_STATE", "pending_decision cannot coexist with an active operation or plan");
      }
      assertKnownKeys(
        decision,
        /* @__PURE__ */ new Set(["decision_id", "source_operation_id", "created_at", "options"]),
        "pending_decision"
      );
      if (!isUuid(decision.decision_id)) fail("INVALID_STATE", "pending_decision.decision_id must be a UUID");
      if (!isUuid(decision.source_operation_id)) {
        fail("INVALID_STATE", "pending_decision.source_operation_id must be a UUID");
      }
      if (!isTimestamp(decision.created_at)) {
        fail("INVALID_STATE", "pending_decision.created_at must be an RFC3339 UTC timestamp");
      }
      assertArray(decision.options, "pending_decision.options");
      if (decision.options.length < 2 || decision.options.length > 4) {
        fail("INVALID_STATE", "pending_decision.options must contain 2-4 choices");
      }
      decision.options.forEach((option, index) => {
        const label = `pending_decision.options[${index}]`;
        assertKnownKeys(
          option,
          /* @__PURE__ */ new Set(["number", "assignment"]),
          label
        );
        if (option.number !== index + 1) {
          fail("INVALID_STATE", `${label}.number must match its sequential position`);
        }
        const normalizedAssignment = normalizeAssignmentShape(
          option.assignment,
          `${label}.assignment`,
          true
        );
        if (!deepEqual(option.assignment, normalizedAssignment)) {
          fail("INVALID_STATE", `${label}.assignment must be stored in canonical form`);
        }
        if (normalizedAssignment.route === "report_writer" && normalizedAssignment.scope_ref !== null && state.report_assembly.analysis_artifact_ids === null) {
          fail(
            "INVALID_STATE",
            `${label}.assignment cannot approve a report scope with unresolved evidence binding`
          );
        }
      });
      if (hasDuplicateAssignments(decision.options)) {
        fail("INVALID_STATE", "pending_decision.options must contain distinct assignments");
      }
    }
    function validateResponseReceipt(state, planInfo) {
      const receipt = state.response_receipt;
      if (receipt === null) {
        if (state.pending_decision !== null) {
          fail("INVALID_STATE", "pending_decision requires its matching response_receipt");
        }
        return;
      }
      if (planInfo.kind !== "idle" || state.state_meta.active_operation !== null) {
        fail("INVALID_STATE", "response_receipt cannot coexist with an active operation or plan");
      }
      assertKnownKeys(
        receipt,
        /* @__PURE__ */ new Set([
          "operation_id",
          "revision",
          "created_at",
          "response_markdown",
          "direct_assignment"
        ]),
        "response_receipt"
      );
      if (!Object.prototype.hasOwnProperty.call(receipt, "direct_assignment")) {
        fail("INVALID_STATE", "response_receipt.direct_assignment is required");
      }
      if (!isUuid(receipt.operation_id)) {
        fail("INVALID_STATE", "response_receipt.operation_id must be a UUID");
      }
      if (receipt.revision !== state.state_meta.revision) {
        fail("INVALID_STATE", "response_receipt.revision must match the current state revision");
      }
      if (!isTimestamp(receipt.created_at)) {
        fail("INVALID_STATE", "response_receipt.created_at must be an RFC3339 UTC timestamp");
      }
      if (typeof receipt.response_markdown !== "string" || !receipt.response_markdown.trim()) {
        fail("INVALID_STATE", "response_receipt.response_markdown must be nonempty");
      }
      if (receipt.direct_assignment !== null) {
        const normalized = normalizeAssignment(state, receipt.direct_assignment, "response_receipt.direct_assignment").assignment;
        if (!deepEqual(normalized, receipt.direct_assignment)) {
          fail("INVALID_STATE", "response_receipt.direct_assignment must be stored in canonical form");
        }
      }
      if (state.pending_decision !== null && receipt.direct_assignment !== null) {
        fail("INVALID_STATE", "response_receipt cannot contain both a numbered decision and a direct assignment");
      }
      if (state.pending_decision !== null && state.pending_decision.source_operation_id !== receipt.operation_id) {
        fail("INVALID_STATE", "pending_decision and response_receipt must come from the same operation");
      }
    }
    function validateState(state, options = {}) {
      const { templateMode = false } = options;
      assertExactTopLevel(state);
      assertKnownKeys(state.state_meta, /* @__PURE__ */ new Set([
        "schema_version",
        "project_id",
        "revision",
        "created_at",
        "updated_at",
        "active_operation",
        "startup_notice"
      ]), "state_meta");
      if (state.state_meta.schema_version !== SCHEMA_VERSION) {
        fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${state.state_meta.schema_version}`);
      }
      if (templateMode) {
        if (state.state_meta.project_id !== null || state.state_meta.created_at !== null || state.state_meta.updated_at !== null) {
          fail("INVALID_STATE", "the bundled template must leave runtime metadata null");
        }
      } else {
        if (!isUuid(state.state_meta.project_id)) fail("INVALID_STATE", "state_meta.project_id must be a UUID");
        if (!isTimestamp(state.state_meta.created_at) || !isTimestamp(state.state_meta.updated_at)) {
          fail("INVALID_STATE", "state_meta timestamps must be RFC3339 UTC values");
        }
      }
      if (!Number.isInteger(state.state_meta.revision) || state.state_meta.revision < 0) {
        fail("INVALID_STATE", "state_meta.revision must be a nonnegative integer");
      }
      validateStartupNotice(state.state_meta.startup_notice, templateMode);
      assertKnownKeys(state.project_summary, SECTION_KEYS.project_summary, "project_summary");
      assertStringOrNull(state.project_summary.title, "project_summary.title");
      assertStringOrNull(state.project_summary.objective, "project_summary.objective");
      assertStringArray(state.project_summary.materials, "project_summary.materials");
      assertStringOrNull(state.project_summary.last_updated, "project_summary.last_updated");
      assertEnum(state.project_summary.phase, ["exploration", "analysis", "reporting"], "project_summary.phase");
      for (const key of ["data_audit_complete", "domain_knowledge_complete", "causal_check_complete", "exploration_complete"]) {
        if (typeof state.project_summary[key] !== "boolean") fail("INVALID_STATE", `project_summary.${key} must be boolean`);
      }
      assertStringOrNull(state.project_summary.exploration_summary, "project_summary.exploration_summary");
      assertEnum(state.project_summary.analysis_output, ["exist", "non_exist"], "project_summary.analysis_output");
      assertEnum(state.project_summary.report_output, ["exist", "non_exist"], "project_summary.report_output");
      assertObject(state.council_chamber, "council_chamber");
      const chamberKeys = /* @__PURE__ */ new Set(["data_audit", "domain_expert", "causal_check", "causal_discovery", "analysis_execution", "report_writer"]);
      assertKnownKeys(state.council_chamber, chamberKeys, "council_chamber");
      for (const route of ["data_audit", "domain_expert", "causal_check", "causal_discovery", "report_writer"]) {
        validateChamberSlot(state.council_chamber[route], `council_chamber.${route}`, false, templateMode);
      }
      assertObject(state.council_chamber.analysis_execution, "council_chamber.analysis_execution");
      for (const [design, slot] of Object.entries(state.council_chamber.analysis_execution)) {
        if (!DESIGN_IDS.has(design)) fail("INVALID_STATE", `unknown analysis chamber design: ${design}`);
        validateChamberSlot(slot, `council_chamber.analysis_execution.${design}`, true, templateMode);
      }
      const planInfo = validatePlan(state.next_step_plan);
      validateActiveOperation(state.state_meta, planInfo);
      for (const section of ["data_facts", "domain_knowledge", "causal_facts", "discovery_sidecar", "report_assembly"]) {
        assertKnownKeys(state[section], SECTION_KEYS[section], section);
        assertStringOrNull(state[section].last_updated, `${section}.last_updated`);
      }
      assertEnum(state.data_facts.data_checked, ["not_checked", "passing", "limited", "imagined", "blocked"], "data_facts.data_checked");
      assertStringOrNullFields(state.data_facts, ["audit_scope", "unit_of_observation"], "data_facts");
      assertStringArrayFields(state.data_facts, [
        "data_sources",
        "variables",
        "structure_notes",
        "timing_notes",
        "dependency_notes",
        "leakage_risks",
        "missingness_notes",
        "support_notes",
        "validity_questions",
        "exploratory_runs",
        "artifact_refs"
      ], "data_facts");
      assertEnum(state.domain_knowledge.domain_checked, ["not_checked", "passing", "limited", "blocked"], "domain_knowledge.domain_checked");
      assertStringOrNullFields(state.domain_knowledge, ["domain_scope", "user_provided", "data_facts"], "domain_knowledge");
      assertStringArrayFields(state.domain_knowledge, [
        "construct_notes",
        "measurement_notes",
        "population_setting_notes",
        "domain_practice",
        "source_limitations",
        "practice_searches",
        "references"
      ], "domain_knowledge");
      assertEnum(state.causal_facts.causal_checked, ["not_checked", "passing", "limited", "blocked"], "causal_facts.causal_checked");
      assertEnum(state.causal_facts.analysis_readiness, ["ready", "limited", "not_ready", "blocked"], "causal_facts.analysis_readiness");
      assertStringOrNullFields(state.causal_facts, [
        "causal_question",
        "exposure_or_intervention",
        "outcome",
        "estimand",
        "support_status"
      ], "causal_facts");
      assertStringArrayFields(state.causal_facts, ["assumptions", "threats", "recommended_checks"], "causal_facts");
      assertArray(state.causal_facts.recommended_method_routes, "causal_facts.recommended_method_routes");
      state.causal_facts.recommended_method_routes.forEach((route, index) => {
        const label = `causal_facts.recommended_method_routes[${index}]`;
        assertKnownKeys(route, /* @__PURE__ */ new Set(["id", "category", "route_cautions"]), label);
        assertEnum(route.category, ["design", "support"], `${label}.category`);
        const expected = route.category === "design" ? DESIGN_IDS : SUPPORT_IDS;
        if (!expected.has(route.id)) fail("INVALID_STATE", `${label}.id is not a valid ${route.category} route`);
        assertStringArray(route.route_cautions, `${label}.route_cautions`);
      });
      const recommendedIds = state.causal_facts.recommended_method_routes.map((route) => route.id);
      if (new Set(recommendedIds).size !== recommendedIds.length) {
        fail("INVALID_STATE", "recommended_method_routes must not contain duplicate route IDs");
      }
      const recommendedDesigns = state.causal_facts.recommended_method_routes.filter((route) => route.category === "design");
      const recommendedSupports = state.causal_facts.recommended_method_routes.filter((route) => route.category === "support");
      if (recommendedDesigns.length > 1 || recommendedSupports.length > 1) {
        fail("INVALID_STATE", "recommended_method_routes may contain at most one design and one support route");
      }
      if (recommendedSupports.length && !recommendedDesigns.length) {
        fail("INVALID_STATE", "a recommended support route requires a recommended design route");
      }
      validateAnalysisOptions(state.causal_facts.analysis_options);
      validateAnalysisPortfolioConsistency(state.causal_facts);
      assertEnum(state.discovery_sidecar.status, ["not_started", "scoped", "artifact_created", "reviewed", "blocked"], "discovery_sidecar.status");
      assertStringOrNullFields(state.discovery_sidecar, ["goal", "scope", "method_summary"], "discovery_sidecar");
      const missingDiscoveryControl = ["scope_id", "scope_revision", "execution_contract"].filter(
        (field) => !Object.prototype.hasOwnProperty.call(state.discovery_sidecar, field)
      );
      if (missingDiscoveryControl.length) {
        fail("INVALID_STATE", `discovery_sidecar is missing: ${missingDiscoveryControl.join(", ")}`);
      }
      const discoveryHasIdentity = isUuid(state.discovery_sidecar.scope_id) && Number.isInteger(state.discovery_sidecar.scope_revision) && state.discovery_sidecar.scope_revision >= 1;
      const discoveryEmptyIdentity = state.discovery_sidecar.scope_id === null && state.discovery_sidecar.scope_revision === 0;
      if (!discoveryHasIdentity && !discoveryEmptyIdentity) {
        fail("INVALID_STATE", "discovery_sidecar has an invalid scope identity");
      }
      if (discoveryHasIdentity) {
        validateDiscoveryContract(
          state.discovery_sidecar.execution_contract,
          "discovery_sidecar.execution_contract"
        );
      } else if (state.discovery_sidecar.execution_contract !== null) {
        fail("INVALID_STATE", "an unbound discovery_sidecar must have a null execution_contract");
      }
      assertStringArrayFields(state.discovery_sidecar, ["findings", "diagnostics", "limitations", "artifact_refs", "reviewer_requests"], "discovery_sidecar");
      assertEnum(state.report_assembly.current_format, [null, "md", "html"], "report_assembly.current_format");
      assertStringOrNullFields(state.report_assembly, ["report_goal", "audience", "target_section"], "report_assembly");
      assertStringArrayFields(state.report_assembly, ["planned_structure", "key_points", "wording_constraints", "draft_notes"], "report_assembly");
      if (state.report_assembly.analysis_artifact_ids !== null) {
        const normalizedReportEvidence = normalizeAnalysisArtifactIds(
          state.report_assembly.analysis_artifact_ids,
          "report_assembly.analysis_artifact_ids",
          "INVALID_STATE"
        );
        if (!deepEqual(normalizedReportEvidence, state.report_assembly.analysis_artifact_ids)) {
          fail("INVALID_STATE", "report_assembly.analysis_artifact_ids must be unique and sorted");
        }
      }
      const reportHasIdentity = isUuid(state.report_assembly.scope_id) && Number.isInteger(state.report_assembly.scope_revision) && state.report_assembly.scope_revision >= 1;
      const reportEmptyIdentity = state.report_assembly.scope_id === null && state.report_assembly.scope_revision === 0;
      if (!reportHasIdentity && !reportEmptyIdentity) fail("INVALID_STATE", "report_assembly has an invalid scope identity");
      if (reportEmptyIdentity && (state.report_assembly.analysis_artifact_ids === null || state.report_assembly.analysis_artifact_ids.length)) {
        fail("INVALID_STATE", "an unbound report_assembly cannot bind analysis artifacts");
      }
      if (state.report_assembly.analysis_artifact_ids === null && state.state_meta.active_operation?.report_evidence_binding_protocol === 1) {
        fail("INVALID_STATE", "report evidence-binding protocol 1 requires a resolved artifact-ID list");
      }
      const reportStatus = state.council_chamber.report_writer.current_status;
      if (!templateMode && ["ready", "blocked", "done"].includes(reportStatus) && !reportHasIdentity) {
        fail("INVALID_STATE", `report_assembly requires scope identity for status ${reportStatus}`);
      }
      if (reportStatus !== null && !["requested", "ready", "blocked", "done"].includes(reportStatus)) {
        fail("INVALID_STATE", "council_chamber.report_writer.current_status is invalid");
      }
      validateActiveScopeBinding(state, planInfo);
      operationPacket(state, state.state_meta.active_operation, planInfo);
      assertArray(state.artifact_records, "artifact_records");
      state.artifact_records.forEach(validateArtifactRecord);
      const ids = state.artifact_records.map((item) => item.artifact_id);
      if (new Set(ids).size !== ids.length) fail("INVALID_STATE", "artifact_id values must be unique");
      const recordsById = new Map(state.artifact_records.map((record) => [record.artifact_id, record]));
      if (state.report_assembly.analysis_artifact_ids === null) {
        if (!state.artifact_records.some((record) => record.route === "analysis_execution" && record.artifact_role === "completion")) {
          fail(
            "INVALID_STATE",
            "a null report evidence binding requires historical analysis completion records"
          );
        }
      } else {
        state.report_assembly.analysis_artifact_ids.forEach((artifactId) => {
          const record = recordsById.get(artifactId);
          if (!record || record.route !== "analysis_execution" || record.artifact_role !== "completion") {
            fail(
              "INVALID_STATE",
              `report_assembly.analysis_artifact_ids must reference analysis completion records: ${artifactId}`
            );
          }
        });
      }
      const operationIds = state.artifact_records.map((item) => item.operation_id).filter(Boolean);
      if (new Set(operationIds).size !== operationIds.length) fail("INVALID_STATE", "operation_id may appear in only one artifact record");
      const completionArtifacts = state.artifact_records.filter((record) => record.artifact_role === "completion");
      const activeOperation = state.state_meta.active_operation;
      const activeOperationHasArtifact = activeOperation !== null && completionArtifacts.some((record) => record.operation_id === activeOperation.id);
      const pendingAnalysisCloseout = activeOperation !== null && activeOperation.stage === "lead_pending" && planInfo.actor !== null && planInfo.actor.startsWith("analysis_execution.") && activeOperationHasArtifact;
      const pendingReportCloseout = activeOperation !== null && activeOperation.stage === "lead_pending" && planInfo.actor === "report_writer" && activeOperationHasArtifact;
      if (state.project_summary.data_audit_complete && !["passing", "limited"].includes(state.data_facts.data_checked)) {
        fail("INVALID_STATE", "data_audit_complete requires data_checked passing or limited");
      }
      if (state.project_summary.domain_knowledge_complete && !["passing", "limited"].includes(state.domain_knowledge.domain_checked)) {
        fail("INVALID_STATE", "domain_knowledge_complete requires domain_checked passing or limited");
      }
      if (state.project_summary.causal_check_complete && !["passing", "limited"].includes(state.causal_facts.causal_checked)) {
        fail("INVALID_STATE", "causal_check_complete requires causal_checked passing or limited");
      }
      if (state.project_summary.exploration_complete && !(state.project_summary.data_audit_complete && state.project_summary.domain_knowledge_complete && state.project_summary.causal_check_complete)) {
        fail("INVALID_STATE", "exploration_complete requires all three core completion flags");
      }
      if (state.project_summary.analysis_output === "exist" && !completionArtifacts.some((record) => record.route === "analysis_execution")) {
        fail("INVALID_STATE", "analysis_output exist requires an analysis_execution artifact record");
      }
      if (state.project_summary.analysis_output === "non_exist" && completionArtifacts.some((record) => record.route === "analysis_execution")) {
        if (!pendingAnalysisCloseout) {
          fail("INVALID_STATE", "analysis_output non_exist conflicts with a completed analysis artifact");
        }
      }
      if (state.project_summary.report_output === "exist") {
        if (!completionArtifacts.some((record) => record.route === "report_writer")) {
          fail("INVALID_STATE", "report_output exist requires a report_writer artifact record");
        }
      }
      if (state.project_summary.report_output === "non_exist" && state.report_assembly.current_format !== null) {
        if (!pendingReportCloseout) {
          fail("INVALID_STATE", "report_output non_exist requires null report format outside a pending report closeout");
        }
      }
      if (state.project_summary.report_output === "non_exist" && completionArtifacts.some((record) => record.route === "report_writer")) {
        if (!pendingReportCloseout) {
          fail("INVALID_STATE", "report_output non_exist conflicts with a completed report artifact");
        }
      }
      validatePendingDecision(state, planInfo);
      validateResponseReceipt(state, planInfo);
      if (state.state_meta.startup_notice !== null && (state.pending_decision !== null || state.response_receipt !== null)) {
        fail("INVALID_STATE", "state_meta.startup_notice cannot coexist with a completed response");
      }
      return { planInfo };
    }
    function instantiateTemplate(template, startupNotice) {
      const state = clone(template);
      const timestamp = nowIso();
      state.state_meta.project_id = crypto.randomUUID();
      state.state_meta.revision = 0;
      state.state_meta.created_at = timestamp;
      state.state_meta.updated_at = timestamp;
      state.state_meta.active_operation = null;
      state.state_meta.startup_notice = clone(startupNotice);
      state.pending_decision = null;
      state.response_receipt = null;
      validateState(state);
      return state;
    }
    function isOpinionsEra(state) {
      if (!isObject(state) || !isObject(state.council_chamber)) return false;
      if (Object.values(state.council_chamber).some((slot) => isObject(slot) && "opinions" in slot)) return true;
      const analysis = state.council_chamber.analysis_execution;
      return isObject(analysis) && "current_status" in analysis;
    }
    function validateLegacyShape(state) {
      assertExactTopLevel(state, LEGACY_TOP_LEVEL);
      if (isOpinionsEra(state)) fail("UNSUPPORTED_SCHEMA", "opinions-era project state is not supported by the v5 migrator");
      assertObject(state.project_summary, "project_summary");
      assertObject(state.council_chamber, "council_chamber");
      for (const key of ["data_audit", "domain_expert", "causal_check", "causal_discovery", "analysis_execution", "report_writer"]) {
        if (!(key in state.council_chamber)) fail("UNSUPPORTED_SCHEMA", `legacy council_chamber is missing ${key}`);
      }
      assertArray(state.next_step_plan, "next_step_plan");
      for (const key of ["data_facts", "domain_knowledge", "causal_facts", "discovery_sidecar", "report_assembly"]) {
        assertObject(state[key], key);
      }
      assertArray(state.artifact_records, "artifact_records");
    }
    function legacyScopePresent(slot) {
      if (!isObject(slot)) return false;
      return Object.values(slot).some((value) => {
        if (Array.isArray(value)) return value.length > 0;
        if (isObject(value)) return Object.keys(value).length > 0;
        return value !== null && value !== void 0;
      });
    }
    function addDiscoveryControls(state) {
      assertObject(state.discovery_sidecar, "discovery_sidecar");
      if (!Object.prototype.hasOwnProperty.call(state.state_meta, "active_operation")) {
        fail("INVALID_STATE", "state_meta is missing active_operation");
      }
      if (state.state_meta.active_operation !== null) {
        assertObject(state.state_meta.active_operation, "state_meta.active_operation");
      }
      state.discovery_sidecar.scope_id = null;
      state.discovery_sidecar.scope_revision = 0;
      state.discovery_sidecar.execution_contract = null;
      if (state.state_meta.active_operation !== null && !Object.prototype.hasOwnProperty.call(state.state_meta.active_operation, "discovery_scope")) {
        state.state_meta.active_operation.discovery_scope = null;
      }
    }
    function addSchema5Controls(state) {
      assertObject(state.council_chamber.analysis_execution, "council_chamber.analysis_execution");
      for (const slot of Object.values(state.council_chamber.analysis_execution)) {
        assertObject(slot, "analysis chamber slot");
        slot.execution_contract = null;
      }
      state.artifact_records = state.artifact_records.map((record) => ({
        ...record,
        artifact_role: "completion"
      }));
      if (state.state_meta.active_operation !== null) {
        state.state_meta.active_operation.completion_protocol = 0;
        state.state_meta.active_operation.contract_hash = null;
      }
    }
    function addSchema6Controls(state) {
      assertObject(state.causal_facts, "causal_facts");
      if (Object.prototype.hasOwnProperty.call(state.causal_facts, "analysis_options")) {
        fail("UNSUPPORTED_SCHEMA", "pre-v6 causal_facts cannot already contain analysis_options");
      }
      state.causal_facts.analysis_options = [];
      assertObject(state.council_chamber.analysis_execution, "council_chamber.analysis_execution");
      for (const slot of Object.values(state.council_chamber.analysis_execution)) {
        if (Object.prototype.hasOwnProperty.call(slot, "causal_basis_hash")) {
          fail("UNSUPPORTED_SCHEMA", "pre-v6 analysis slots cannot already contain causal_basis_hash");
        }
        slot.causal_basis_hash = null;
      }
      const active = state.state_meta.active_operation;
      if (active !== null && active.scope_ref?.kind === "analysis") {
        const planInfo = validatePlan(state.next_step_plan);
        const slot = planInfo.design === null ? null : state.council_chamber.analysis_execution[planInfo.design];
        if (slot && slot.scope_id === active.scope_ref.id && slot.scope_revision === active.scope_ref.revision) {
          slot.causal_basis_hash = analysisCausalBasisHash(state);
        }
      }
      if (state.response_receipt !== null) {
        if (Object.prototype.hasOwnProperty.call(state.response_receipt, "direct_assignment")) {
          fail("UNSUPPORTED_SCHEMA", "pre-v6 response_receipt cannot already contain direct_assignment");
        }
        state.response_receipt.direct_assignment = null;
      }
    }
    function addSchema7Controls(state, projectRoot) {
      assertObject(state.report_assembly, "report_assembly");
      if (Object.prototype.hasOwnProperty.call(state.report_assembly, "analysis_artifact_ids")) {
        fail("UNSUPPORTED_SCHEMA", "pre-v7 report_assembly cannot already contain analysis_artifact_ids");
      }
      const reportHasScope = isUuid(state.report_assembly.scope_id) && Number.isInteger(state.report_assembly.scope_revision) && state.report_assembly.scope_revision >= 1;
      const hasAnalysisCompletion = state.artifact_records.some((record) => record.route === "analysis_execution" && record.artifact_role === "completion");
      state.report_assembly.analysis_artifact_ids = reportHasScope && hasAnalysisCompletion ? null : [];
      const targetsCurrentReportScope = (assignment) => assignment?.route === "report_writer" && assignment.scope_ref?.kind === "report" && assignment.scope_ref.id === state.report_assembly.scope_id && assignment.scope_ref.revision === state.report_assembly.scope_revision;
      if (state.report_assembly.analysis_artifact_ids === null) {
        if (targetsCurrentReportScope(state.response_receipt?.direct_assignment)) {
          state.response_receipt.direct_assignment = null;
        }
        if (state.pending_decision !== null && state.pending_decision.options.some((option) => targetsCurrentReportScope(option.assignment))) {
          state.pending_decision = null;
        }
      }
      const active = state.state_meta.active_operation;
      if (active !== null) {
        if (Object.prototype.hasOwnProperty.call(active, "report_evidence_binding_protocol")) {
          fail(
            "UNSUPPORTED_SCHEMA",
            "pre-v7 active_operation cannot already contain report_evidence_binding_protocol"
          );
        }
        const planInfo = validatePlan(state.next_step_plan);
        active.report_evidence_binding_protocol = planInfo.actor === "report_writer" ? 0 : null;
      }
    }
    function finalizeSchemaMigration(state) {
      state.state_meta.revision += 1;
      state.state_meta.updated_at = nowIso();
      if (state.response_receipt !== null) {
        state.response_receipt.revision = state.state_meta.revision;
      }
      validateState(state);
      return state;
    }
    function migrateLegacyState(legacy, options = {}) {
      const { discardPlan = false, projectRoot } = options;
      validateLegacyShape(legacy);
      if (legacy.next_step_plan.length && !discardPlan) {
        fail("LEGACY_ACTIVE_PLAN", "recognized v4.5 state has a nonempty transient plan and cannot be resumed safely");
      }
      const state = clone(legacy);
      if (discardPlan) state.next_step_plan = [];
      const timestamp = nowIso();
      state.state_meta = {
        schema_version: SCHEMA_VERSION,
        project_id: crypto.randomUUID(),
        revision: 0,
        created_at: timestamp,
        updated_at: timestamp,
        active_operation: null,
        startup_notice: null
      };
      const reordered = { state_meta: state.state_meta };
      for (const key of LEGACY_TOP_LEVEL) reordered[key] = state[key];
      reordered.pending_decision = null;
      reordered.response_receipt = null;
      if ("discovery_sidecar_output" in reordered.project_summary) {
        delete reordered.project_summary.discovery_sidecar_output;
      }
      for (const [design, slot] of Object.entries(reordered.council_chamber.analysis_execution)) {
        if (!DESIGN_IDS.has(design) || !isObject(slot)) {
          fail("UNSUPPORTED_SCHEMA", `legacy analysis slot ${design} is not a supported v4.5 design slot`);
        }
        if (legacyScopePresent(slot)) {
          slot.scope_id = crypto.randomUUID();
          slot.scope_revision = 1;
        } else {
          slot.scope_id = null;
          slot.scope_revision = 0;
        }
      }
      const reportStatus = reordered.council_chamber.report_writer.current_status;
      const reportHasContent = reportStatus !== null || legacyScopePresent(reordered.report_assembly);
      reordered.report_assembly.scope_id = reportHasContent ? crypto.randomUUID() : null;
      reordered.report_assembly.scope_revision = reportHasContent ? 1 : 0;
      reordered.artifact_records = reordered.artifact_records.map((record, index) => ({
        ...record,
        artifact_id: `legacy-${String(index + 1).padStart(4, "0")}`,
        operation_id: null
      }));
      addDiscoveryControls(reordered);
      addSchema5Controls(reordered);
      addSchema6Controls(reordered);
      addSchema7Controls(reordered, projectRoot);
      validateState(reordered);
      return reordered;
    }
    function migrateV2State(v2, projectRoot) {
      assertExactTopLevel(v2, V2_TOP_LEVEL);
      assertObject(v2.state_meta, "state_meta");
      if (v2.state_meta.schema_version !== 2) {
        fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v2.state_meta.schema_version}`);
      }
      const migrated = clone(v2);
      migrated.state_meta.schema_version = SCHEMA_VERSION;
      migrated.state_meta.startup_notice = null;
      migrated.pending_decision = null;
      migrated.response_receipt = null;
      addDiscoveryControls(migrated);
      addSchema5Controls(migrated);
      addSchema6Controls(migrated);
      addSchema7Controls(migrated, projectRoot);
      validateState(migrated);
      return finalizeSchemaMigration(migrated);
    }
    function migrateV3State(v3, projectRoot) {
      assertExactTopLevel(v3);
      assertObject(v3.state_meta, "state_meta");
      if (v3.state_meta.schema_version !== 3) {
        fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v3.state_meta.schema_version}`);
      }
      const migrated = clone(v3);
      migrated.state_meta.schema_version = SCHEMA_VERSION;
      addDiscoveryControls(migrated);
      addSchema5Controls(migrated);
      addSchema6Controls(migrated);
      addSchema7Controls(migrated, projectRoot);
      validateState(migrated);
      return finalizeSchemaMigration(migrated);
    }
    function migrateV4State(v4, projectRoot) {
      assertExactTopLevel(v4);
      assertObject(v4.state_meta, "state_meta");
      if (v4.state_meta.schema_version !== 4) {
        fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v4.state_meta.schema_version}`);
      }
      const migrated = clone(v4);
      migrated.state_meta.schema_version = SCHEMA_VERSION;
      addSchema5Controls(migrated);
      addSchema6Controls(migrated);
      addSchema7Controls(migrated, projectRoot);
      validateState(migrated);
      return finalizeSchemaMigration(migrated);
    }
    function migrateV5State(v5, projectRoot) {
      assertExactTopLevel(v5);
      assertObject(v5.state_meta, "state_meta");
      if (v5.state_meta.schema_version !== 5) {
        fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v5.state_meta.schema_version}`);
      }
      const migrated = clone(v5);
      migrated.state_meta.schema_version = SCHEMA_VERSION;
      addSchema6Controls(migrated);
      addSchema7Controls(migrated, projectRoot);
      validateState(migrated);
      return finalizeSchemaMigration(migrated);
    }
    function upgradeV6State(v6, projectRoot) {
      assertExactTopLevel(v6);
      assertObject(v6.state_meta, "state_meta");
      if (v6.state_meta.schema_version !== 6) {
        fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v6.state_meta.schema_version}`);
      }
      const migrated = clone(v6);
      migrated.state_meta.schema_version = SCHEMA_VERSION;
      addSchema7Controls(migrated, projectRoot);
      validateState(migrated);
      return migrated;
    }
    function migrateV6State(v6, projectRoot) {
      return finalizeSchemaMigration(upgradeV6State(v6, projectRoot));
    }
    function availableRegularFile(filePath) {
      try {
        return fs.lstatSync(filePath).isFile();
      } catch (_error) {
        return false;
      }
    }
    function artifactWarnings(projectRoot, state) {
      const warnings = [];
      state.artifact_records.forEach((record) => {
        let resolved;
        try {
          resolved = resolveOutputPath(projectRoot, record.location);
        } catch (_error) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_PATH",
            artifact_id: record.artifact_id,
            location: record.location
          });
          return;
        }
        if (!fs.existsSync(resolved)) {
          warnings.push({
            code: "MISSING_HISTORICAL_ARTIFACT",
            artifact_id: record.artifact_id,
            location: record.location
          });
          return;
        }
        if (/^legacy-\d{4}$/.test(record.artifact_id)) return;
        let kind;
        try {
          const stat = fs.lstatSync(resolved);
          if (stat.isFile()) kind = "file";
          else if (stat.isDirectory()) kind = "directory";
          else {
            warnings.push({
              code: "INVALID_HISTORICAL_ARTIFACT_TYPE",
              artifact_id: record.artifact_id,
              location: record.location
            });
            return;
          }
        } catch (_error) {
          warnings.push({
            code: "MISSING_HISTORICAL_ARTIFACT",
            artifact_id: record.artifact_id,
            location: record.location
          });
          return;
        }
        const manifestPath = manifestPathFor(resolved, kind);
        const relativeManifestPath = normalizePath(path.relative(path.resolve(projectRoot), manifestPath));
        if (!fs.existsSync(manifestPath)) {
          warnings.push({
            code: "MISSING_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
          return;
        }
        if (!availableRegularFile(manifestPath)) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
          return;
        }
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        } catch (_error) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
          return;
        }
        if (!isObject(manifest)) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
          return;
        }
        const manifestKeys = /* @__PURE__ */ new Set([
          "schema_version",
          "operation_id",
          "route",
          "scope_ref",
          "discovery_contract",
          "files",
          "completed_at",
          "summary",
          "artifact_role",
          "execution_receipt",
          "requirements"
        ]);
        const legacyManifest = manifest.schema_version === LEGACY_MANIFEST_VERSION;
        const receiptManifest = manifest.schema_version === RECEIPT_MANIFEST_VERSION;
        const currentManifest = manifest.schema_version === MANIFEST_VERSION;
        let manifestRole = null;
        let normalizedReceipt = null;
        let normalizedRequirements = null;
        let receiptValid = true;
        if (legacyManifest) {
          manifestRole = "completion";
        } else if (receiptManifest || currentManifest) {
          manifestRole = manifest.artifact_role;
          try {
            assertEnum(manifestRole, ARTIFACT_ROLES, "historical artifact manifest.artifact_role", "INVALID_ARTIFACT_RECEIPT");
            normalizedReceipt = manifest.execution_receipt === null ? null : normalizeExecutionReceipt(
              manifest.execution_receipt,
              "historical artifact manifest.execution_receipt",
              manifest.schema_version
            );
            if (normalizedReceipt !== null && !deepEqual(normalizedReceipt, manifest.execution_receipt)) {
              receiptValid = false;
            }
            if (normalizedReceipt !== null && (manifestRole === "completion" && normalizedReceipt.unmet_requirements.length > 0 || manifestRole === "infeasibility_evidence" && normalizedReceipt.unmet_requirements.length === 0)) {
              receiptValid = false;
            }
            if (currentManifest) {
              normalizedRequirements = normalizeManifestRequirements(
                manifest.requirements,
                normalizedReceipt?.contract_hash ?? null,
                "historical artifact manifest.requirements"
              );
              if (!deepEqual(normalizedRequirements, manifest.requirements)) {
                receiptValid = false;
              }
              validateReceiptAgainstPacket(
                normalizedReceipt,
                {
                  completion_protocol: normalizedReceipt === null ? 0 : 2,
                  contract_hash: normalizedReceipt?.contract_hash ?? null,
                  requirements: normalizedRequirements
                },
                manifestRole
              );
            } else if (Object.prototype.hasOwnProperty.call(manifest, "requirements")) {
              receiptValid = false;
            }
          } catch (_error) {
            receiptValid = false;
          }
          if (manifestRole === "infeasibility_evidence" && normalizedReceipt === null) receiptValid = false;
        }
        const expectedScopeKind = record.route === "analysis_execution" ? "analysis" : record.route === "report_writer" ? "report" : record.route === "causal_discovery" ? "discovery" : null;
        const scopeRef = manifest.scope_ref;
        const scopeRefShapeValid = isObject(scopeRef) && Object.keys(scopeRef).length === 3 && Object.keys(scopeRef).every((key) => ["kind", "id", "revision"].includes(key)) && isUuid(scopeRef.id) && Number.isInteger(scopeRef.revision) && scopeRef.revision >= 1;
        const legacyDiscovery = legacyManifest && record.route === "causal_discovery" && scopeRef === null;
        const scopeRefValid = legacyDiscovery ? manifest.discovery_contract === void 0 : expectedScopeKind === null ? scopeRef === null : scopeRefShapeValid && scopeRef.kind === expectedScopeKind;
        let discoveryContractValid = manifest.discovery_contract === void 0;
        if (record.route === "causal_discovery" && !legacyDiscovery) {
          try {
            validateDiscoveryContract(
              manifest.discovery_contract,
              "historical artifact manifest.discovery_contract"
            );
            discoveryContractValid = true;
          } catch (_error) {
            discoveryContractValid = false;
          }
        }
        const requiredManifestKeys = [
          "schema_version",
          "operation_id",
          "route",
          "scope_ref",
          "files",
          "completed_at",
          "summary"
        ];
        if (receiptManifest || currentManifest) {
          requiredManifestKeys.push("artifact_role", "execution_receipt");
        }
        if (currentManifest) requiredManifestKeys.push("requirements");
        if (Object.keys(manifest).some((key) => !manifestKeys.has(key)) || requiredManifestKeys.some((key) => !Object.prototype.hasOwnProperty.call(manifest, key)) || !legacyManifest && !receiptManifest && !currentManifest || legacyManifest && ("artifact_role" in manifest || "execution_receipt" in manifest) || (legacyManifest || receiptManifest) && "requirements" in manifest || manifestRole !== record.artifact_role || !receiptValid || manifest.operation_id !== record.operation_id || manifest.route !== record.route || !scopeRefValid || !discoveryContractValid || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.some((item) => typeof item !== "string" || !item.trim()) || !isTimestamp(manifest.completed_at) || typeof manifest.summary !== "string" || manifest.summary.trim() !== record.summary.trim()) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
          return;
        }
        if (legacyDiscovery) {
          warnings.push({
            code: "UNBOUND_LEGACY_DISCOVERY_ARTIFACT",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
        }
        const normalizedManifestFiles = manifest.files.map(normalizePath);
        const manifestInventory = new Set(normalizedManifestFiles);
        let includesPrimary = false;
        let includesDeliverable = false;
        for (const normalized of normalizedManifestFiles) {
          let listedPath;
          try {
            listedPath = resolveOutputPath(projectRoot, normalized);
          } catch (_error) {
            warnings.push({
              code: "INVALID_HISTORICAL_ARTIFACT_FILE_PATH",
              artifact_id: record.artifact_id,
              location: record.location,
              file: normalized
            });
            continue;
          }
          if (kind === "directory") {
            if (!listedPath.startsWith(`${resolved}${path.sep}`)) {
              warnings.push({
                code: "INVALID_HISTORICAL_ARTIFACT_FILE_PATH",
                artifact_id: record.artifact_id,
                location: record.location,
                file: normalized
              });
              continue;
            }
            if (listedPath !== manifestPath) includesDeliverable = true;
          } else if (normalized === normalizePath(record.location)) {
            includesPrimary = true;
            includesDeliverable = true;
          }
          if (!fs.existsSync(listedPath) || !availableRegularFile(listedPath)) {
            warnings.push({
              code: "MISSING_HISTORICAL_ARTIFACT_FILE",
              artifact_id: record.artifact_id,
              location: record.location,
              file: normalized
            });
          }
        }
        if (normalizedReceipt !== null && normalizedReceipt.evidence_files.some((file) => !manifestInventory.has(file))) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
        }
        if (kind === "file" && !includesPrimary || !includesDeliverable) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
            artifact_id: record.artifact_id,
            location: record.location,
            manifest_path: relativeManifestPath
          });
        }
      });
      return warnings;
    }
    function unavailableBoundReportAnalysisArtifactIds(projectRoot, state) {
      const bound = new Set(state.report_assembly.analysis_artifact_ids);
      if (!bound.size) return [];
      return [...new Set(
        artifactWarnings(projectRoot, state).filter((warning) => bound.has(warning.artifact_id)).map((warning) => warning.artifact_id)
      )].sort();
    }
    function assertBoundReportAnalysisArtifactsAvailable(projectRoot, state) {
      if (state.report_assembly.analysis_artifact_ids === null) {
        fail(
          "SCOPE_MISMATCH",
          "the legacy report evidence binding is unresolved; select evidence with scope_transition revise and obtain reapproval",
          { report_evidence_binding: "unresolved" }
        );
      }
      const unavailable = unavailableBoundReportAnalysisArtifactIds(projectRoot, state);
      if (!unavailable.length) return;
      fail(
        "SCOPE_MISMATCH",
        "the approved report's bound analysis evidence is unavailable; restore it or revise and reapprove the report scope",
        { unavailable_analysis_artifact_ids: unavailable }
      );
    }
    function statePathFor(projectRoot) {
      return path.join(path.resolve(projectRoot), STATE_FILE);
    }
    function templatePathFor(skillRoot) {
      return path.join(path.resolve(skillRoot), "assets", "project_state_template.yaml");
    }
    function loadTemplate(skillRoot) {
      const templatePath = templatePathFor(skillRoot);
      const template = parseYaml(readText(templatePath), templatePath);
      validateState(template, { templateMode: true });
      return template;
    }
    function openProject({
      projectRoot,
      skillRoot,
      fresh = false,
      discardLegacyPlan = false,
      contextProtocol = null
    }) {
      const selectedContextProtocol = normalizeContextProtocol(contextProtocol, "open context protocol");
      const root = path.resolve(projectRoot);
      const statePath = statePathFor(root);
      const template = loadTemplate(skillRoot);
      const exists = fs.existsSync(statePath);
      if (fresh && discardLegacyPlan) fail("INVALID_INPUT", "--fresh and --discard-legacy-plan cannot be combined");
      if (discardLegacyPlan && !exists) fail("INVALID_INPUT", "--discard-legacy-plan requires an existing recognized v4.5 state");
      if (fresh) {
        const previous = exists ? readBytes(statePath) : null;
        const archivePath = previous === null ? null : archiveBytes(root, previous, "reset");
        const startupNotice = archivePath === null ? { kind: "created", archive_path: null } : {
          kind: "reset",
          archive_path: normalizePath(path.relative(root, archivePath))
        };
        const state = instantiateTemplate(template, startupNotice);
        atomicWrite(statePath, stringifyYaml(state));
        const context2 = contextForCurrentStage(
          state,
          validatePlan(state.next_step_plan),
          [],
          null,
          selectedContextProtocol
        );
        return {
          ok: true,
          code: exists ? "RESET" : "CREATED_FRESH",
          state_path: statePath,
          archive_path: archivePath,
          project_id: state.state_meta.project_id,
          revision: state.state_meta.revision,
          mode: "idle",
          operation_packet: null,
          warnings: [],
          ...context2
        };
      }
      if (!exists) {
        const state = instantiateTemplate(template, {
          kind: "created",
          archive_path: null
        });
        atomicWrite(statePath, stringifyYaml(state));
        const context2 = contextForCurrentStage(
          state,
          validatePlan(state.next_step_plan),
          [],
          null,
          selectedContextProtocol
        );
        return {
          ok: true,
          code: "CREATED",
          state_path: statePath,
          project_id: state.state_meta.project_id,
          revision: state.state_meta.revision,
          mode: "idle",
          operation_packet: null,
          warnings: [],
          ...context2
        };
      }
      const original = readBytes(statePath);
      const parsed = parseYaml(original.toString("utf8"), statePath);
      if (!isObject(parsed.state_meta)) {
        const migrated = migrateLegacyState(parsed, {
          discardPlan: discardLegacyPlan,
          projectRoot: root
        });
        const warnings2 = artifactWarnings(root, migrated);
        const serialized = stringifyYaml(migrated);
        const archivePath = archiveBytes(root, original, discardLegacyPlan ? "migration-v45-discarded-plan" : "migration-v45");
        atomicWrite(statePath, serialized);
        const context2 = contextForCurrentStage(
          migrated,
          validatePlan(migrated.next_step_plan),
          warnings2,
          null,
          selectedContextProtocol
        );
        return {
          ok: true,
          code: discardLegacyPlan ? "MIGRATED_LEGACY_PLAN_DISCARDED" : "MIGRATED",
          state_path: statePath,
          archive_path: archivePath,
          project_id: migrated.state_meta.project_id,
          revision: migrated.state_meta.revision,
          mode: "idle",
          operation_packet: null,
          warnings: warnings2,
          ...context2
        };
      }
      if ([2, 3, 4, 5, 6].includes(parsed.state_meta.schema_version)) {
        if (discardLegacyPlan) {
          fail("INVALID_INPUT", "--discard-legacy-plan applies only to a recognized unversioned v4.5 state");
        }
        const sourceVersion = parsed.state_meta.schema_version;
        const migrated = sourceVersion === 2 ? migrateV2State(parsed, root) : sourceVersion === 3 ? migrateV3State(parsed, root) : sourceVersion === 4 ? migrateV4State(parsed, root) : sourceVersion === 5 ? migrateV5State(parsed, root) : migrateV6State(parsed, root);
        const { planInfo: planInfo2 } = validateState(migrated);
        const operation2 = migrated.state_meta.active_operation;
        const packet2 = operationPacket(migrated, operation2, planInfo2);
        const mode2 = operation2 === null ? "idle" : operation2.stage === "worker_pending" ? "resume_worker" : "resume_lead";
        const artifactStatus2 = operation2 && operation2.artifact_intent ? inspectReservedArtifact(root, operation2, planInfo2.actor, packet2) : null;
        const warnings2 = artifactWarnings(root, migrated);
        const visibleWarnings2 = visibleReportArtifactWarnings(migrated, planInfo2, warnings2);
        const serialized = stringifyYaml(migrated);
        const archivePath = archiveBytes(root, original, `migration-v${sourceVersion}-v${SCHEMA_VERSION}`);
        atomicWrite(statePath, serialized);
        const context2 = contextForCurrentStage(
          migrated,
          planInfo2,
          visibleWarnings2,
          artifactStatus2,
          selectedContextProtocol
        );
        return {
          ok: true,
          code: `MIGRATED_V${sourceVersion}`,
          state_path: statePath,
          archive_path: archivePath,
          project_id: migrated.state_meta.project_id,
          revision: migrated.state_meta.revision,
          mode: mode2,
          plan: migrated.next_step_plan,
          plan_actor: planInfo2.actor,
          active_operation: operation2,
          operation_packet: packet2,
          artifact_status: artifactStatus2,
          warnings: visibleWarnings2,
          ...context2
        };
      }
      if (discardLegacyPlan) {
        fail("INVALID_INPUT", "--discard-legacy-plan applies only to a recognized unversioned v4.5 state");
      }
      const { planInfo } = validateState(parsed);
      const operation = parsed.state_meta.active_operation;
      const packet = operationPacket(parsed, operation, planInfo);
      let mode = "idle";
      let code = "OPENED";
      if (operation) {
        mode = operation.stage === "worker_pending" ? "resume_worker" : "resume_lead";
        code = operation.stage === "worker_pending" ? "RESUME_WORKER" : "RESUME_LEAD";
      }
      const artifactStatus = operation && operation.artifact_intent ? inspectReservedArtifact(root, operation, planInfo.actor, packet) : null;
      const warnings = artifactWarnings(root, parsed);
      const visibleWarnings = visibleReportArtifactWarnings(parsed, planInfo, warnings);
      const context = contextForCurrentStage(
        parsed,
        planInfo,
        visibleWarnings,
        artifactStatus,
        selectedContextProtocol
      );
      return {
        ok: true,
        code,
        state_path: statePath,
        project_id: parsed.state_meta.project_id,
        revision: parsed.state_meta.revision,
        mode,
        plan: parsed.next_step_plan,
        plan_actor: planInfo.actor,
        active_operation: operation,
        operation_packet: packet,
        artifact_status: artifactStatus,
        warnings: visibleWarnings,
        ...context
      };
    }
    function loadCurrentState(projectRoot) {
      const statePath = statePathFor(projectRoot);
      if (!fs.existsSync(statePath)) fail("MISSING_STATE", `${statePath} does not exist`);
      const text = readText(statePath);
      const state = parseYaml(text, statePath);
      validateState(state);
      return { statePath, state };
    }
    function assertExpected(state, payload) {
      if (!isObject(payload)) fail("INVALID_INPUT", "command input must be a JSON object");
      if (payload.expected_project_id !== state.state_meta.project_id) {
        fail("STALE_PROJECT", "expected_project_id does not match the active project");
      }
      if (!Number.isInteger(payload.expected_revision)) fail("INVALID_INPUT", "expected_revision must be an integer");
      if (payload.expected_revision !== state.state_meta.revision) {
        fail("STALE_REVISION", `expected revision ${payload.expected_revision}, found ${state.state_meta.revision}`, {
          current_revision: state.state_meta.revision
        });
      }
    }
    function commitMutation(statePath, state) {
      state.state_meta.revision += 1;
      state.state_meta.updated_at = nowIso();
      validateState(state);
      atomicWrite(statePath, stringifyYaml(state));
      return state.state_meta.revision;
    }
    function resolveScopeReference(state, route, scopeRef, support = null) {
      validateScopeRef(scopeRef, "scope_ref", "INVALID_INPUT");
      if (scopeRef === null) return;
      let current;
      let status;
      if (route.startsWith("analysis_execution.")) {
        if (scopeRef.kind !== "analysis") fail("SCOPE_MISMATCH", "analysis route requires an analysis scope reference");
        const design = route.slice("analysis_execution.".length);
        current = state.council_chamber.analysis_execution[design];
        status = current && current.current_status;
        if (current && current.support !== support) {
          fail("SCOPE_MISMATCH", "analysis support route does not match the ready scope");
        }
        if (current && (current.causal_basis_hash === null || current.causal_basis_hash !== analysisCausalBasisHash(state))) {
          fail(
            "SCOPE_MISMATCH",
            "the ready analysis scope uses an older causal basis and must be revised"
          );
        }
      } else if (route === "report_writer") {
        if (scopeRef.kind !== "report") fail("SCOPE_MISMATCH", "report_writer requires a report scope reference");
        if (state.report_assembly.analysis_artifact_ids === null) {
          fail(
            "SCOPE_MISMATCH",
            "the legacy report evidence binding is unresolved; revise the report scope with an explicit evidence selection before approval",
            { report_evidence_binding: "unresolved" }
          );
        }
        current = state.report_assembly;
        status = state.council_chamber.report_writer.current_status;
      } else if (route === "causal_discovery") {
        if (scopeRef.kind !== "discovery") fail("SCOPE_MISMATCH", "causal_discovery requires a discovery scope reference");
        current = state.discovery_sidecar;
        if (current.scope_id !== scopeRef.id || current.scope_revision !== scopeRef.revision || current.execution_contract === null) fail("SCOPE_MISMATCH", "the requested discovery scope reference is not current");
        return;
      } else {
        fail("SCOPE_MISMATCH", `${route} cannot use a scope reference`);
      }
      if (!current || current.scope_id !== scopeRef.id || current.scope_revision !== scopeRef.revision) {
        fail("SCOPE_MISMATCH", "the requested scope reference is not current");
      }
      if (status !== "ready") {
        fail("SCOPE_MISMATCH", `scope status ${status} cannot be bound for execution`);
      }
    }
    function assertAnalysisBeginAllowed(state, design, support) {
      const reviewed = ["passing", "limited"];
      const actionable = ["ready", "limited"];
      const failures = [];
      const requireOneOf = (field, actual, allowed) => {
        if (!allowed.includes(actual)) failures.push({ field, actual, allowed });
      };
      requireOneOf("data_facts.data_checked", state.data_facts.data_checked, reviewed);
      requireOneOf("domain_knowledge.domain_checked", state.domain_knowledge.domain_checked, reviewed);
      requireOneOf("causal_facts.causal_checked", state.causal_facts.causal_checked, reviewed);
      requireOneOf("causal_facts.analysis_readiness", state.causal_facts.analysis_readiness, actionable);
      const designRecommendation = state.causal_facts.recommended_method_routes.find((route) => route.category === "design");
      if (!designRecommendation || designRecommendation.id !== design) {
        failures.push({
          field: "causal_facts.recommended_method_routes.design",
          actual: designRecommendation ? designRecommendation.id : null,
          allowed: [design]
        });
      }
      if (support !== null) {
        const supportRecommendation = state.causal_facts.recommended_method_routes.find((route) => route.category === "support");
        if (!supportRecommendation || supportRecommendation.id !== support) {
          failures.push({
            field: "causal_facts.recommended_method_routes.support",
            actual: supportRecommendation ? supportRecommendation.id : null,
            allowed: [support]
          });
        }
      }
      if (design === "descriptive_association" && state.causal_facts.analysis_readiness === "ready") {
        failures.push({
          field: "causal_facts.analysis_readiness",
          actual: state.causal_facts.analysis_readiness,
          allowed: ["limited"]
        });
      }
      if (failures.length) {
        fail("ANALYSIS_GATE_FAILED", "analysis route entry requirements are not satisfied", {
          route: `analysis_execution.${design}`,
          failures
        });
      }
    }
    function normalizeAssignmentShape(input, label = "assignment", stateMode = false) {
      const inputCode = stateMode ? "INVALID_STATE" : "INVALID_INPUT";
      const routeCode = stateMode ? "INVALID_STATE" : "PLAN_MISMATCH";
      const scopeCode = stateMode ? "INVALID_STATE" : "SCOPE_MISMATCH";
      assertKnownKeys(
        input,
        /* @__PURE__ */ new Set(["route", "support", "intent_summary", "scope_ref"]),
        label,
        inputCode
      );
      const route = input.route;
      const support = input.support ?? null;
      const scopeRef = input.scope_ref ?? null;
      if (typeof input.intent_summary !== "string" || !input.intent_summary.trim() || input.intent_summary.length > MAX_INTENT_LENGTH) {
        fail(inputCode, `${label}.intent_summary must contain 1-${MAX_INTENT_LENGTH} characters`);
      }
      validateScopeRef(scopeRef, `${label}.scope_ref`, inputCode);
      if (route === "team_lead") {
        if (support !== null || scopeRef !== null) fail(inputCode, "team_lead cannot use support or scope_ref");
      } else if (CORE_WORKERS.has(route)) {
        if (support !== null) fail(inputCode, "core routes cannot use support");
        if (scopeRef !== null && !["report_writer", "causal_discovery"].includes(route)) {
          fail(scopeCode, `${route} cannot use scope_ref`);
        }
        if (scopeRef !== null && route === "report_writer" && scopeRef.kind !== "report") {
          fail(scopeCode, "report_writer requires a report scope reference");
        }
        if (scopeRef !== null && route === "causal_discovery" && scopeRef.kind !== "discovery") {
          fail(scopeCode, "causal_discovery requires a discovery scope reference");
        }
      } else if (typeof route === "string" && route.startsWith("analysis_execution.")) {
        const design = route.slice("analysis_execution.".length);
        if (!DESIGN_IDS.has(design)) fail(routeCode, `unknown analysis design route: ${design}`);
        if (support !== null && !SUPPORT_IDS.has(support)) fail(routeCode, `unknown support route: ${support}`);
        if (scopeRef !== null && scopeRef.kind !== "analysis") {
          fail(scopeCode, "analysis route requires an analysis scope reference");
        }
      } else {
        fail(routeCode, `unknown route: ${route}`);
      }
      return {
        route,
        support,
        intent_summary: input.intent_summary.trim(),
        scope_ref: scopeRef === null ? null : clone(scopeRef)
      };
    }
    function normalizeAssignment(state, input, label = "assignment") {
      const assignment = normalizeAssignmentShape(input, label);
      if (typeof assignment.route === "string" && assignment.route.startsWith("analysis_execution.") && !Object.prototype.hasOwnProperty.call(input, "support")) {
        const recommendedSupport = state.causal_facts.recommended_method_routes.find((route2) => route2.category === "support");
        if (recommendedSupport) assignment.support = recommendedSupport.id;
      }
      const {
        route,
        support,
        scope_ref: scopeRef
      } = assignment;
      let plan;
      let stage;
      if (route === "team_lead") {
        plan = [{ id: "team_lead" }];
        stage = "lead_pending";
      } else if (CORE_WORKERS.has(route)) {
        resolveScopeReference(state, route, scopeRef, support);
        plan = [{ id: route }, { id: "team_lead" }];
        stage = "worker_pending";
      } else if (typeof route === "string" && route.startsWith("analysis_execution.")) {
        const design = route.slice("analysis_execution.".length);
        resolveScopeReference(state, route, scopeRef, support);
        assertAnalysisBeginAllowed(state, design, support);
        plan = [{ id: route, support }, { id: "team_lead" }];
        stage = "worker_pending";
      }
      return {
        assignment,
        plan,
        stage
      };
    }
    function resolveDecisionSelection(state, selection) {
      assertKnownKeys(
        selection,
        /* @__PURE__ */ new Set(["decision_id", "option_number"]),
        "begin selection",
        "INVALID_INPUT"
      );
      const decision = state.pending_decision;
      if (decision === null) fail("NO_PENDING_DECISION", "no pending numbered decision exists");
      if (selection.decision_id !== decision.decision_id) {
        fail("STALE_DECISION", "decision_id does not match the pending decision");
      }
      if (!Number.isInteger(selection.option_number)) {
        fail("INVALID_DECISION_OPTION", "option_number must be an integer");
      }
      const option = decision.options.find((item) => item.number === selection.option_number);
      if (!option) fail("INVALID_DECISION_OPTION", "option_number does not exist in the pending decision");
      return option.assignment;
    }
    function beginOperation({
      projectRoot,
      payload,
      contextProtocol = null
    }) {
      const { statePath, state } = loadCurrentState(projectRoot);
      assertExpected(state, payload);
      if (state.state_meta.active_operation !== null || state.next_step_plan.length) {
        fail("ACTIVE_OPERATION", "finish or cancel the active operation before beginning another");
      }
      const assignmentFields = ["route", "support", "intent_summary", "scope_ref"];
      const allowedInput = /* @__PURE__ */ new Set([
        "expected_project_id",
        "expected_revision",
        "selection",
        "artifact_reservation",
        ...assignmentFields
      ]);
      assertKnownKeys(payload, allowedInput, "begin input", "INVALID_INPUT");
      const selectedContextProtocol = normalizeContextProtocol(
        contextProtocol,
        "begin context protocol"
      );
      const hasSelection = Object.prototype.hasOwnProperty.call(payload, "selection");
      if (hasSelection && assignmentFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
        fail("INVALID_INPUT", "begin selection cannot be combined with route assignment fields");
      }
      const assignmentInput = hasSelection ? resolveDecisionSelection(state, payload.selection) : Object.fromEntries(
        assignmentFields.filter((field) => Object.prototype.hasOwnProperty.call(payload, field)).map((field) => [field, payload[field]])
      );
      const { assignment, plan, stage } = normalizeAssignment(state, assignmentInput, "begin assignment");
      if (assignment.route === "report_writer" && assignment.scope_ref !== null) {
        assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
      }
      const operation = {
        id: crypto.randomUUID(),
        stage,
        intent_summary: assignment.intent_summary,
        scope_ref: assignment.scope_ref,
        artifact_intent: null,
        discovery_scope: null,
        completion_protocol: 0,
        contract_hash: null,
        report_evidence_binding_protocol: assignment.route === "report_writer" ? state.report_assembly.analysis_artifact_ids === null ? 0 : 1 : null,
        started_at: nowIso()
      };
      if (assignment.route === "causal_discovery" && assignment.scope_ref !== null) {
        operation.discovery_scope = {
          transition: "preserve",
          base_ref: clone(assignment.scope_ref),
          contract: clone(state.discovery_sidecar.execution_contract)
        };
      }
      const planInfo = validatePlan(plan);
      setOperationProtocol(state, operation, planInfo);
      state.next_step_plan = plan;
      state.state_meta.active_operation = operation;
      state.pending_decision = null;
      state.response_receipt = null;
      const reservation = payload.artifact_reservation === void 0 ? null : reserveArtifactIntent(
        projectRoot,
        operation,
        planInfo,
        payload.artifact_reservation,
        "begin input.artifact_reservation"
      );
      const warnings = artifactWarnings(projectRoot, state);
      const currentPacket = operationPacket(state, operation, planInfo);
      const artifactStatus = reservation === null ? null : inspectReservedArtifact(projectRoot, operation, planInfo.actor, currentPacket);
      if (artifactStatus !== null) assertCleanArtifactReservation(artifactStatus);
      const revision = commitMutation(statePath, state);
      const context = contextForCurrentStage(
        state,
        planInfo,
        warnings,
        artifactStatus,
        selectedContextProtocol
      );
      return {
        ok: true,
        code: stage === "lead_pending" ? "BEGAN_LEAD" : "BEGAN_WORKER",
        project_id: state.state_meta.project_id,
        revision,
        operation_id: operation.id,
        stage,
        plan,
        operation_packet: currentPacket,
        ...reservation === null ? {} : reservation,
        ...context
      };
    }
    function assertOperation(state, payload, requiredStage = null) {
      const operation = state.state_meta.active_operation;
      if (!operation) fail("NO_ACTIVE_OPERATION", "no active operation exists");
      if (payload.operation_id !== operation.id) fail("STALE_OPERATION", "operation_id does not match the active operation");
      if (requiredStage && operation.stage !== requiredStage) {
        fail("INVALID_STAGE", `operation stage must be ${requiredStage}, found ${operation.stage}`);
      }
      return operation;
    }
    function bindDiscoveryScope(state, operation, value, label) {
      if (operation.discovery_scope !== null || operation.scope_ref !== null) {
        fail("SCOPE_MISMATCH", "the active discovery scope is already frozen");
      }
      assertKnownKeys(value, /* @__PURE__ */ new Set(["transition", "contract"]), label, "INVALID_INPUT");
      const missing = ["transition", "contract"].filter(
        (field) => !Object.prototype.hasOwnProperty.call(value, field)
      );
      if (missing.length) fail("INVALID_INPUT", `${label} is missing: ${missing.join(", ")}`);
      assertEnum(value.transition, ["new", "revise"], `${label}.transition`, "INVALID_INPUT");
      const contract = normalizeDiscoveryContract(
        value.contract,
        `${label}.contract`,
        "INVALID_INPUT"
      );
      let baseRef = null;
      let scopeRef;
      if (value.transition === "new") {
        scopeRef = {
          kind: "discovery",
          id: crypto.randomUUID(),
          revision: 1
        };
      } else {
        const current = state.discovery_sidecar;
        if (!isUuid(current.scope_id) || !Number.isInteger(current.scope_revision) || current.scope_revision < 1 || current.execution_contract === null) {
          fail("SCOPE_MISMATCH", "cannot revise a discovery scope that has no current contract");
        }
        baseRef = {
          kind: "discovery",
          id: current.scope_id,
          revision: current.scope_revision
        };
        scopeRef = {
          ...baseRef,
          revision: baseRef.revision + 1
        };
      }
      operation.scope_ref = scopeRef;
      operation.discovery_scope = {
        transition: value.transition,
        base_ref: baseRef,
        contract
      };
      setOperationProtocol(state, operation, validatePlan(state.next_step_plan));
    }
    function normalizeExtension(value) {
      if (value === void 0 || value === null || value === "") return "";
      if (typeof value !== "string") fail("INVALID_INPUT", "extension must be a string");
      const extension = value.startsWith(".") ? value : `.${value}`;
      if (!/^\.[a-z0-9]{1,10}$/i.test(extension)) fail("INVALID_INPUT", "extension must be a simple file extension");
      return extension.toLowerCase();
    }
    function pathIsWithin(root, candidate) {
      const relative = path.relative(root, candidate);
      return relative === "" || !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
    }
    function assertArtifactAncestorsWithinProject(projectRoot, candidate) {
      const root = path.resolve(projectRoot);
      let realRoot;
      try {
        realRoot = fs.realpathSync(root);
      } catch (error) {
        fail("IO_ERROR", `could not resolve project root for artifact safety: ${error.message}`);
      }
      const relative = path.relative(root, candidate);
      const segments = relative.split(path.sep).filter(Boolean);
      let current = root;
      for (let index = 0; index < segments.length - 1; index += 1) {
        current = path.join(current, segments[index]);
        let stat;
        try {
          stat = fs.lstatSync(current);
        } catch (error) {
          if (error && error.code === "ENOENT") return;
          if (error && error.code === "ENOTDIR") {
            fail("INVALID_ARTIFACT_PATH", "an artifact path ancestor is not a directory");
          }
          fail("IO_ERROR", `could not inspect artifact path safely: ${error.message}`);
        }
        if (stat.isSymbolicLink()) {
          fail("INVALID_ARTIFACT_PATH", "artifact path ancestors under output must not be links");
        }
        let realCurrent;
        try {
          realCurrent = fs.realpathSync(current);
        } catch (error) {
          if (error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) {
            fail("INVALID_ARTIFACT_PATH", "artifact path contains a dangling or invalid link");
          }
          fail("IO_ERROR", `could not resolve artifact path safely: ${error.message}`);
        }
        if (!pathIsWithin(realRoot, realCurrent)) {
          fail("INVALID_ARTIFACT_PATH", "artifact path resolves outside the project root");
        }
        if (index < segments.length - 1) {
          let resolvedStat;
          try {
            resolvedStat = fs.statSync(current);
          } catch (error) {
            if (error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) {
              fail("INVALID_ARTIFACT_PATH", "artifact path contains a dangling or invalid ancestor");
            }
            fail("IO_ERROR", `could not inspect artifact path ancestor: ${error.message}`);
          }
          if (!resolvedStat.isDirectory()) {
            fail("INVALID_ARTIFACT_PATH", "an artifact path ancestor is not a directory");
          }
        }
      }
    }
    function resolveOutputPath(projectRoot, relativeLocation) {
      const normalized = normalizePath(relativeLocation);
      if (!normalized.startsWith("output/") || normalized.includes("\0")) {
        fail("INVALID_ARTIFACT_PATH", "artifact location must be a relative path under output/");
      }
      const root = path.resolve(projectRoot);
      const outputRoot = path.resolve(root, "output");
      const resolved = path.resolve(root, ...normalized.split("/"));
      if (resolved !== outputRoot && !resolved.startsWith(`${outputRoot}${path.sep}`)) {
        fail("INVALID_ARTIFACT_PATH", "artifact location escapes the project output directory");
      }
      assertArtifactAncestorsWithinProject(root, resolved);
      return resolved;
    }
    function reserveArtifactIntent(projectRoot, operation, planInfo, input, label) {
      assertObject(input, label, "INVALID_INPUT");
      assertKnownKeys(input, /* @__PURE__ */ new Set(["kind", "slug", "extension"]), label, "INVALID_INPUT");
      const actor = planInfo.actor;
      if (!(ARTIFACT_ACTORS.has(actor) || actor.startsWith("analysis_execution."))) {
        fail("OWNERSHIP_VIOLATION", `${actor} cannot create durable artifacts`);
      }
      if ((actor === "report_writer" || actor.startsWith("analysis_execution.")) && operation.scope_ref === null) {
        fail("SCOPE_MISMATCH", `${actor} must begin with an exact ready scope_ref before reserving output`);
      }
      if (actor === "causal_discovery" && operation.discovery_scope === null) {
        fail("SCOPE_MISMATCH", "causal_discovery must freeze a discovery_scope before reserving output");
      }
      if (operation.artifact_intent !== null) fail("ARTIFACT_ALREADY_RESERVED", "this operation already has an artifact reservation");
      assertEnum(input.kind, ["file", "directory"], `${label}.kind`, "INVALID_INPUT");
      if (typeof input.slug !== "string" || input.slug.length > MAX_ARTIFACT_SLUG_LENGTH || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(input.slug)) {
        fail("INVALID_INPUT", `${label}.slug must contain at most ${MAX_ARTIFACT_SLUG_LENGTH} lowercase letters, digits, hyphens, or underscores`);
      }
      const extension = input.kind === "file" ? normalizeExtension(input.extension) : "";
      if (input.kind === "file" && !extension) fail("INVALID_INPUT", `${label} file artifacts require an extension`);
      if (input.kind === "directory" && input.extension !== void 0) {
        fail("INVALID_INPUT", `${label} directory artifacts do not use extensions`);
      }
      const location = `output/${input.slug}-${operation.id.slice(0, 8)}${extension}`;
      const artifactIntent = { kind: input.kind, location };
      const target = resolveOutputPath(projectRoot, location);
      const manifest = manifestPathFor(target, input.kind);
      const temporary = resolveOutputPath(
        projectRoot,
        temporaryArtifactLocation(artifactIntent, operation.id)
      );
      if (artifactEntryExists(target) || artifactEntryExists(manifest) || artifactEntryExists(temporary)) {
        fail("ARTIFACT_COLLISION", `reserved artifact path already exists: ${location}`);
      }
      operation.artifact_intent = artifactIntent;
      return {
        artifact_intent: clone(artifactIntent),
        temporary_path: temporaryArtifactLocation(artifactIntent, operation.id),
        manifest_path: normalizePath(path.relative(path.resolve(projectRoot), manifest))
      };
    }
    function reserveArtifact({
      projectRoot,
      payload,
      contextProtocol = null
    }) {
      const { statePath, state } = loadCurrentState(projectRoot);
      assertExpected(state, payload);
      const allowedInput = /* @__PURE__ */ new Set([
        "expected_project_id",
        "expected_revision",
        "operation_id",
        "kind",
        "slug",
        "extension",
        "discovery_scope"
      ]);
      assertKnownKeys(payload, allowedInput, "reserve-artifact input", "INVALID_INPUT");
      const selectedContextProtocol = normalizeContextProtocol(
        contextProtocol,
        "reserve-artifact context protocol"
      );
      const operation = assertOperation(state, payload, "worker_pending");
      const planInfo = validatePlan(state.next_step_plan);
      const actor = planInfo.actor;
      const previousPacket = operationPacket(state, operation, planInfo);
      if (actor === "report_writer" && operation.scope_ref !== null) {
        assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
      }
      if (payload.discovery_scope !== void 0) {
        if (actor !== "causal_discovery") {
          fail("OWNERSHIP_VIOLATION", `${actor} cannot set discovery_scope`);
        }
        bindDiscoveryScope(state, operation, payload.discovery_scope, "reserve-artifact discovery_scope");
      }
      if (operation.completion_protocol === 1 && operation.artifact_intent === null) {
        setOperationProtocol(state, operation, planInfo);
      }
      const reservation = reserveArtifactIntent(
        projectRoot,
        operation,
        planInfo,
        {
          kind: payload.kind,
          slug: payload.slug,
          ...payload.extension !== void 0 ? { extension: payload.extension } : {}
        },
        "reserve-artifact input"
      );
      const currentPacket = operationPacket(state, operation, planInfo);
      const warnings = artifactWarnings(projectRoot, state);
      const artifactStatus = inspectReservedArtifact(projectRoot, operation, actor, currentPacket);
      assertCleanArtifactReservation(artifactStatus);
      const revision = commitMutation(statePath, state);
      const context = selectedContextProtocol === PHASE_CAPSULE_PROTOCOL ? { phase_capsule: phaseCapsule(state, planInfo, "worker", warnings, artifactStatus) } : {};
      return {
        ok: true,
        code: "ARTIFACT_RESERVED",
        project_id: state.state_meta.project_id,
        revision,
        operation_id: operation.id,
        artifact_intent: reservation.artifact_intent,
        scope_ref: operation.scope_ref,
        discovery_scope: operation.discovery_scope,
        ...operationPacketResult(previousPacket, currentPacket),
        temporary_path: reservation.temporary_path,
        manifest_path: reservation.manifest_path,
        ...context
      };
    }
    function temporaryArtifactLocation(intent, operationId) {
      const normalized = normalizePath(intent.location);
      const directory = path.posix.dirname(normalized);
      const name = path.posix.basename(normalized);
      return `${directory}/.${name}.tmp-${operationId.slice(0, 8)}`;
    }
    function manifestPathFor(target, kind) {
      return kind === "directory" ? path.join(target, "artifact-manifest.json") : `${target}.manifest.json`;
    }
    function expectedArtifactRoute(actor) {
      return actor.startsWith("analysis_execution.") ? "analysis_execution" : actor;
    }
    function isMissingArtifactFsError(error) {
      return error && ["ENOENT", "ENOTDIR"].includes(error.code);
    }
    function failArtifactFsError(error, missingMessage, ioMessage) {
      if (isMissingArtifactFsError(error)) {
        fail("MISSING_ARTIFACT", `${missingMessage}: ${error.message}`);
      }
      fail("IO_ERROR", `${ioMessage}: ${error.message}`);
    }
    function lstatRequiredArtifact(filePath, missingMessage, ioMessage) {
      try {
        return fs.lstatSync(filePath);
      } catch (error) {
        failArtifactFsError(error, missingMessage, ioMessage);
      }
    }
    function readRequiredArtifactText(filePath, missingMessage, ioMessage) {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch (error) {
        failArtifactFsError(error, missingMessage, ioMessage);
      }
    }
    function validateManifest(projectRoot, operation, actor, packet, expectedArtifact = null) {
      const intent = operation.artifact_intent;
      if (!intent) fail("MISSING_ARTIFACT", "no artifact is reserved for this operation");
      const target = resolveOutputPath(projectRoot, intent.location);
      const manifestPath = manifestPathFor(target, intent.kind);
      const relativeManifestPath = normalizePath(
        path.relative(path.resolve(projectRoot), manifestPath)
      );
      const actualFiles = validateArtifactBody(projectRoot, operation, target).filter((file) => file !== relativeManifestPath);
      const manifestStat = lstatRequiredArtifact(
        manifestPath,
        `completion manifest does not exist: ${manifestPath}`,
        `could not inspect completion manifest ${manifestPath}`
      );
      if (!manifestStat.isFile()) {
        fail("INVALID_ARTIFACT_MANIFEST", "completion manifest must be a regular file");
      }
      const manifestText = readRequiredArtifactText(
        manifestPath,
        `completion manifest does not exist: ${manifestPath}`,
        `could not read completion manifest ${manifestPath}`
      );
      let manifest;
      try {
        manifest = JSON.parse(manifestText);
      } catch (error) {
        fail("INVALID_ARTIFACT_MANIFEST", `completion manifest is invalid JSON: ${error.message}`);
      }
      if (!isObject(manifest)) fail("INVALID_ARTIFACT_MANIFEST", "completion manifest must be a JSON object");
      const legacyManifest = manifest.schema_version === LEGACY_MANIFEST_VERSION;
      const receiptManifest = manifest.schema_version === RECEIPT_MANIFEST_VERSION;
      const currentManifest = manifest.schema_version === MANIFEST_VERSION;
      if (!legacyManifest && !receiptManifest && !currentManifest) {
        fail("INVALID_ARTIFACT_MANIFEST", "unsupported manifest schema version");
      }
      assertKnownKeys(manifest, /* @__PURE__ */ new Set([
        "schema_version",
        "operation_id",
        "route",
        "scope_ref",
        "discovery_contract",
        "files",
        "completed_at",
        "summary",
        "artifact_role",
        "execution_receipt",
        "requirements"
      ]), "artifact manifest", "INVALID_ARTIFACT_MANIFEST");
      const requiredManifestKeys = [
        "schema_version",
        "operation_id",
        "route",
        "scope_ref",
        "files",
        "completed_at",
        "summary"
      ];
      if (receiptManifest || currentManifest) requiredManifestKeys.push("artifact_role", "execution_receipt");
      if (currentManifest) requiredManifestKeys.push("requirements");
      const missingManifestKeys = requiredManifestKeys.filter(
        (field) => !Object.prototype.hasOwnProperty.call(manifest, field)
      );
      if (missingManifestKeys.length) {
        fail(
          (receiptManifest || currentManifest) && missingManifestKeys.some((field) => ["artifact_role", "execution_receipt"].includes(field)) ? "INVALID_ARTIFACT_RECEIPT" : "INVALID_ARTIFACT_MANIFEST",
          `artifact manifest is missing: ${missingManifestKeys.join(", ")}`
        );
      }
      if (legacyManifest && ("artifact_role" in manifest || "execution_receipt" in manifest || "requirements" in manifest)) {
        fail(
          "INVALID_ARTIFACT_MANIFEST",
          "schema-1 manifests cannot declare artifact_role, execution_receipt, or requirements"
        );
      }
      if (receiptManifest && "requirements" in manifest) {
        fail("INVALID_ARTIFACT_MANIFEST", "schema-2 manifests cannot declare requirements");
      }
      const artifactRole = legacyManifest ? "completion" : manifest.artifact_role;
      assertEnum(artifactRole, ARTIFACT_ROLES, "artifact manifest.artifact_role", "INVALID_ARTIFACT_RECEIPT");
      const executionReceipt = legacyManifest || manifest.execution_receipt === null ? null : normalizeExecutionReceipt(
        manifest.execution_receipt,
        "artifact manifest.execution_receipt",
        manifest.schema_version
      );
      if ((receiptManifest || currentManifest) && executionReceipt !== null && !deepEqual(executionReceipt, manifest.execution_receipt)) {
        fail("INVALID_ARTIFACT_RECEIPT", "artifact manifest execution_receipt must use canonical strings and paths");
      }
      const manifestRequirements = currentManifest ? normalizeManifestRequirements(
        manifest.requirements,
        packet.contract_hash,
        "artifact manifest.requirements"
      ) : null;
      if (currentManifest && !deepEqual(manifestRequirements, manifest.requirements)) {
        fail("INVALID_ARTIFACT_MANIFEST", "artifact manifest requirements must use canonical strings");
      }
      if (currentManifest && !deepEqual(manifestRequirements, packet.requirements)) {
        fail("SCOPE_MISMATCH", "artifact manifest requirements do not match the bound operation packet");
      }
      if (manifest.operation_id !== operation.id) fail("INVALID_ARTIFACT_MANIFEST", "manifest operation_id does not match");
      if (manifest.route !== expectedArtifactRoute(actor)) fail("INVALID_ARTIFACT_MANIFEST", "manifest route does not match the active worker");
      if (!deepEqual(manifest.scope_ref ?? null, operation.scope_ref ?? null)) fail("INVALID_ARTIFACT_MANIFEST", "manifest scope_ref does not match");
      if (actor === "causal_discovery") {
        if (operation.discovery_scope === null || !deepEqual(manifest.discovery_contract, operation.discovery_scope.contract)) {
          fail("INVALID_ARTIFACT_MANIFEST", "manifest discovery_contract does not match the frozen scope");
        }
      } else if (manifest.discovery_contract !== void 0) {
        fail("INVALID_ARTIFACT_MANIFEST", "only causal_discovery manifests may contain discovery_contract");
      }
      if (!isTimestamp(manifest.completed_at)) fail("INVALID_ARTIFACT_MANIFEST", "manifest completed_at must be RFC3339 UTC");
      if (typeof manifest.summary !== "string" || !manifest.summary.trim()) fail("INVALID_ARTIFACT_MANIFEST", "manifest summary must be nonempty");
      assertArray(manifest.files, "artifact manifest.files", "INVALID_ARTIFACT_MANIFEST");
      if (!manifest.files.length || manifest.files.some((item) => typeof item !== "string" || !item.trim())) {
        fail("INVALID_ARTIFACT_MANIFEST", "manifest files must contain at least one project-relative path");
      }
      const normalizedManifestFiles = manifest.files.map(normalizePath);
      if (new Set(normalizedManifestFiles).size !== normalizedManifestFiles.length) {
        fail("INVALID_ARTIFACT_MANIFEST", "manifest files must not contain duplicates");
      }
      if (!deepEqual([...normalizedManifestFiles].sort(), [...actualFiles].sort())) {
        fail(
          "INVALID_ARTIFACT_MANIFEST",
          "manifest files must exactly match the reserved artifact inventory"
        );
      }
      const normalizedLocation = normalizePath(intent.location);
      let includesPrimary = false;
      let includesDeliverable = false;
      for (const normalized of normalizedManifestFiles) {
        const resolved = resolveOutputPath(projectRoot, normalized);
        const fileStat = lstatRequiredArtifact(
          resolved,
          `manifest file does not exist: ${normalized}`,
          `could not inspect manifest file ${normalized}`
        );
        if (!fileStat.isFile()) {
          fail("MISSING_ARTIFACT", `manifest file does not exist: ${normalized}`);
        }
        if (intent.kind === "directory") {
          if (!resolved.startsWith(`${target}${path.sep}`)) {
            fail("INVALID_ARTIFACT_MANIFEST", `manifest file is outside the reserved directory: ${normalized}`);
          }
          if (resolved !== manifestPath) includesDeliverable = true;
        } else if (normalized === normalizedLocation) {
          includesPrimary = true;
          includesDeliverable = true;
        }
      }
      if (intent.kind === "file" && !includesPrimary) {
        fail("INVALID_ARTIFACT_MANIFEST", "file manifest must list the reserved primary file");
      }
      if (!includesDeliverable) {
        fail("INVALID_ARTIFACT_MANIFEST", "manifest must list at least one deliverable file, not only its own manifest");
      }
      validateReceiptAgainstPacket(executionReceipt, packet, artifactRole, normalizedManifestFiles);
      if (expectedArtifact !== null) {
        if (artifactRole !== expectedArtifact.artifact_role || !deepEqual(executionReceipt, expectedArtifact.execution_receipt)) {
          fail("INVALID_ARTIFACT_RECEIPT", "artifact role and receipt must match the frozen completion manifest");
        }
        if (manifest.summary.trim() !== expectedArtifact.summary) {
          fail("INVALID_ARTIFACT_MANIFEST", "artifact summary must match the completion manifest summary");
        }
      }
      return {
        target,
        manifestPath,
        manifest,
        artifact_role: artifactRole,
        execution_receipt: executionReceipt
      };
    }
    function validateArtifactBody(projectRoot, operation, artifactPath, temporary = false) {
      const intent = operation.artifact_intent;
      const stat = lstatRequiredArtifact(
        artifactPath,
        "reserved artifact does not exist",
        "could not inspect reserved artifact"
      );
      if (intent.kind === "file") {
        if (!stat.isFile() || stat.size === 0) {
          fail("MISSING_ARTIFACT", "reserved file artifact is empty or not a regular file");
        }
        return [intent.location];
      }
      if (!stat.isDirectory()) fail("MISSING_ARTIFACT", "reserved directory artifact is not a directory");
      const files = [];
      const visit = (directory, relativeDirectory = "") => {
        let entries;
        try {
          entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch (error) {
          failArtifactFsError(
            error,
            "reserved directory artifact does not exist",
            "could not inspect reserved directory artifact"
          );
        }
        for (const entry of entries) {
          const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
          const absolute = path.join(directory, entry.name);
          if (relativeDirectory === "" && entry.name.startsWith(".artifact-manifest.json.tmp-")) {
            fail("INVALID_ARTIFACT_PATH", "reserved artifact contains a controller-owned manifest temporary file");
          }
          if (entry.isDirectory()) visit(absolute, relative);
          else if (entry.isFile()) files.push(normalizePath(relative));
          else fail("INVALID_ARTIFACT_PATH", `reserved artifact contains an unsupported entry: ${normalizePath(relative)}`);
        }
      };
      visit(artifactPath);
      if (temporary && files.includes("artifact-manifest.json")) {
        fail("ARTIFACT_COLLISION", "artifact-manifest.json is controller-owned");
      }
      if (!files.length) fail("MISSING_ARTIFACT", "reserved directory artifact contains no deliverable files");
      return files.sort().map((relative) => `${normalizePath(intent.location)}/${relative}`);
    }
    function generatedManifest(operation, actor, files, artifact, packet) {
      const usesLegacyReceipt = operation.completion_protocol === 1 && artifact.execution_receipt !== null && !Object.prototype.hasOwnProperty.call(
        artifact.execution_receipt,
        "requirement_evidence"
      );
      const schemaVersion = usesLegacyReceipt ? RECEIPT_MANIFEST_VERSION : MANIFEST_VERSION;
      return {
        schema_version: schemaVersion,
        operation_id: operation.id,
        route: expectedArtifactRoute(actor),
        scope_ref: operation.scope_ref ?? null,
        artifact_role: artifact.artifact_role,
        execution_receipt: clone(artifact.execution_receipt),
        files,
        completed_at: nowIso(),
        summary: artifact.summary,
        ...schemaVersion === MANIFEST_VERSION ? { requirements: clone(packet.requirements) } : {},
        ...actor === "causal_discovery" ? { discovery_contract: clone(operation.discovery_scope.contract) } : {}
      };
    }
    function artifactSummary(artifactInput) {
      if (!isObject(artifactInput)) fail("INVALID_INPUT", "artifact input must be a mapping");
      if (typeof artifactInput.summary !== "string" || !artifactInput.summary.trim()) {
        fail("INVALID_INPUT", "artifact summary must be nonempty");
      }
      return artifactInput.summary.trim();
    }
    function normalizeArtifactInput(artifactInput, packet) {
      assertKnownKeys(
        artifactInput,
        /* @__PURE__ */ new Set(["summary", "artifact_role", "execution_receipt"]),
        "artifact input",
        "INVALID_INPUT"
      );
      const artifactRole = Object.prototype.hasOwnProperty.call(artifactInput, "artifact_role") ? artifactInput.artifact_role : "completion";
      assertEnum(artifactRole, ARTIFACT_ROLES, "artifact.artifact_role", "INVALID_INPUT");
      const receipt = artifactInput.execution_receipt === void 0 || artifactInput.execution_receipt === null ? null : normalizeExecutionReceipt(artifactInput.execution_receipt);
      return {
        summary: artifactSummary(artifactInput),
        artifact_role: artifactRole,
        execution_receipt: receipt
      };
    }
    function publishReservedArtifact(projectRoot, operation, actor, artifact, packet) {
      const intent = operation.artifact_intent;
      if (!intent) fail("MISSING_ARTIFACT", "no artifact is reserved for this operation");
      const target = resolveOutputPath(projectRoot, intent.location);
      const temporaryLocation = temporaryArtifactLocation(intent, operation.id);
      const temporary = resolveOutputPath(projectRoot, temporaryLocation);
      const manifestPath = manifestPathFor(target, intent.kind);
      const artifactStatus = inspectReservedArtifact(projectRoot, operation, actor, packet);
      if (artifactStatus.location_state === "collision") {
        fail("ARTIFACT_COLLISION", "the reserved artifact locations are in conflict");
      }
      if (artifactStatus.location_state === "absent") {
        fail("MISSING_ARTIFACT", `reserved temporary artifact does not exist: ${temporaryLocation}`);
      }
      if (artifactStatus.location_state === "complete") {
        return validateManifest(projectRoot, operation, actor, packet, artifact);
      }
      if (artifactStatus.location_state === "invalid") {
        if (artifactEntryExists(manifestPath)) {
          validateManifest(projectRoot, operation, actor, packet, artifact);
        }
        validateArtifactBody(projectRoot, operation, target);
        fail(artifactStatus.reason_code, "reserved artifact is invalid");
      }
      if (artifactStatus.location_state === "final-awaiting-manifest") {
        const files = validateArtifactBody(projectRoot, operation, target);
        validateReceiptAgainstPacket(artifact.execution_receipt, packet, artifact.artifact_role, files);
        atomicWrite(
          manifestPath,
          `${JSON.stringify(generatedManifest(operation, actor, files, artifact, packet), null, 2)}
`,
          intent.kind === "directory" ? path.dirname(target) : null
        );
      } else if (artifactStatus.location_state === "temp-only") {
        const files = validateArtifactBody(projectRoot, operation, temporary, true);
        validateReceiptAgainstPacket(artifact.execution_receipt, packet, artifact.artifact_role, files);
        const manifest = generatedManifest(operation, actor, files, artifact, packet);
        try {
          fs.renameSync(temporary, target);
        } catch (error) {
          if (isMissingArtifactFsError(error)) {
            fail("MISSING_ARTIFACT", `reserved temporary artifact does not exist: ${temporaryLocation}`);
          }
          fail("IO_ERROR", `could not publish reserved artifact: ${error.message}`);
        }
        atomicWrite(
          manifestPath,
          `${JSON.stringify(manifest, null, 2)}
`,
          intent.kind === "directory" ? path.dirname(target) : null
        );
      } else {
        fail("INTERNAL_ERROR", `unsupported artifact location state: ${artifactStatus.location_state}`);
      }
      return validateManifest(projectRoot, operation, actor, packet, artifact);
    }
    function artifactEntryExists(filePath) {
      try {
        fs.lstatSync(filePath);
        return true;
      } catch (error) {
        if (isMissingArtifactFsError(error)) return false;
        fail("IO_ERROR", `could not inspect reserved artifact path: ${error.message}`);
      }
    }
    function inspectReservedArtifact(projectRoot, operation, actor, packet) {
      const target = resolveOutputPath(projectRoot, operation.artifact_intent.location);
      const temporary = resolveOutputPath(
        projectRoot,
        temporaryArtifactLocation(operation.artifact_intent, operation.id)
      );
      const manifestPath = manifestPathFor(target, operation.artifact_intent.kind);
      const relativeManifestPath = normalizePath(path.relative(path.resolve(projectRoot), manifestPath));
      const base = {
        location: operation.artifact_intent.location,
        temporary_path: temporaryArtifactLocation(operation.artifact_intent, operation.id),
        manifest_path: relativeManifestPath
      };
      const describe = (locationState, reasonCode = null, details = {}) => ({
        status: locationState === "complete" ? "complete" : "incomplete",
        location_state: locationState,
        ...base,
        ...reasonCode === null ? {} : { reason_code: reasonCode },
        ...details
      });
      const targetExists = artifactEntryExists(target);
      const temporaryExists = artifactEntryExists(temporary);
      const manifestExists = artifactEntryExists(manifestPath);
      if (targetExists && temporaryExists || !targetExists && manifestExists) {
        return describe("collision", "ARTIFACT_COLLISION");
      }
      if (!targetExists) {
        return temporaryExists ? describe("temp-only", "MISSING_ARTIFACT") : describe("absent", "MISSING_ARTIFACT");
      }
      if (!manifestExists) {
        try {
          validateArtifactBody(projectRoot, operation, target);
          return describe("final-awaiting-manifest", "MISSING_ARTIFACT");
        } catch (error) {
          if (error instanceof StateError && ["MISSING_ARTIFACT", "INVALID_ARTIFACT_PATH"].includes(error.code)) {
            return describe("invalid", error.code);
          }
          throw error;
        }
      }
      try {
        const completed = validateManifest(projectRoot, operation, actor, packet);
        return describe("complete", null, {
          artifact_role: completed.artifact_role,
          execution_receipt: completed.execution_receipt
        });
      } catch (error) {
        if (error instanceof StateError && [
          "MISSING_ARTIFACT",
          "INVALID_ARTIFACT_MANIFEST",
          "INVALID_ARTIFACT_PATH",
          "INVALID_ARTIFACT_RECEIPT",
          "INCOMPLETE_WORK",
          "SCOPE_MISMATCH"
        ].includes(error.code)) {
          return describe("invalid", error.code);
        }
        throw error;
      }
    }
    function assertCleanArtifactReservation(artifactStatus) {
      if (artifactStatus.location_state === "absent") return;
      if (artifactStatus.location_state === "invalid" && artifactStatus.reason_code === "INVALID_ARTIFACT_PATH") {
        fail("INVALID_ARTIFACT_PATH", "the reserved artifact path is invalid");
      }
      fail("ARTIFACT_COLLISION", `the reserved artifact locations are not empty: ${artifactStatus.location_state}`);
    }
    function rejectControllerFields(patch, label, fields = ["last_updated"]) {
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
          fail("OWNERSHIP_VIOLATION", `${label}.${field} is controller-owned`);
        }
      }
    }
    function validatePatchKeys(patch, section) {
      assertKnownKeys(patch, SECTION_KEYS[section], `updates.${section}`, "OWNERSHIP_VIOLATION");
      rejectControllerFields(patch, `updates.${section}`);
      if (section === "report_assembly") {
        rejectControllerFields(patch, "updates.report_assembly", ["scope_id", "scope_revision"]);
      }
      if (section === "discovery_sidecar") {
        rejectControllerFields(patch, "updates.discovery_sidecar", ["scope_id", "scope_revision", "execution_contract"]);
      }
    }
    function validateChamberPatch(patch, route, analysis = false) {
      const allowed = analysis ? ANALYSIS_CHAMBER_KEYS : CHAMBER_KEYS;
      assertKnownKeys(patch, allowed, `updates.council_chamber.${route}`, "OWNERSHIP_VIOLATION");
      rejectControllerFields(patch, `updates.council_chamber.${route}`);
      if (analysis) rejectControllerFields(
        patch,
        `updates.council_chamber.${route}`,
        ["scope_id", "scope_revision", "causal_basis_hash"]
      );
    }
    function assertScopeHandoffStatus(patch, label) {
      assertEnum(patch.current_status, ["ready", "blocked", "done"], `${label}.current_status`, "INVALID_INPUT");
    }
    function assertCoreHandoffStatus(patch, label) {
      if (typeof patch.current_status !== "string" || !patch.current_status.trim()) {
        fail("INVALID_INPUT", `${label}.current_status must be a nonempty string`);
      }
    }
    function validateOwnedUpdates(actor, updates) {
      assertObject(updates, "updates", "INVALID_INPUT");
      const keys = new Set(Object.keys(updates));
      const allowedRoots = /* @__PURE__ */ new Set();
      let chamberRoute = actor;
      let analysisDesign = null;
      if (actor === "data_audit") allowedRoots.add("data_facts");
      else if (actor === "domain_expert") allowedRoots.add("domain_knowledge");
      else if (actor === "causal_check") allowedRoots.add("causal_facts");
      else if (actor === "causal_discovery") allowedRoots.add("discovery_sidecar");
      else if (actor === "report_writer") allowedRoots.add("report_assembly");
      else if (actor.startsWith("analysis_execution.")) {
        analysisDesign = actor.slice("analysis_execution.".length);
        chamberRoute = "analysis_execution";
      } else {
        fail("OWNERSHIP_VIOLATION", `unknown worker actor: ${actor}`);
      }
      allowedRoots.add("council_chamber");
      const disallowed = [...keys].filter((key) => !allowedRoots.has(key));
      if (disallowed.length) fail("OWNERSHIP_VIOLATION", `${actor} cannot update: ${disallowed.join(", ")}`);
      for (const section of [...allowedRoots].filter((key) => key !== "council_chamber")) {
        if (updates[section] !== void 0) validatePatchKeys(updates[section], section);
      }
      if (updates.council_chamber !== void 0) {
        assertObject(updates.council_chamber, "updates.council_chamber", "INVALID_INPUT");
        if (analysisDesign) {
          assertKnownKeys(updates.council_chamber, /* @__PURE__ */ new Set(["analysis_execution"]), "updates.council_chamber", "OWNERSHIP_VIOLATION");
          assertObject(updates.council_chamber.analysis_execution, "updates.council_chamber.analysis_execution", "INVALID_INPUT");
          assertKnownKeys(updates.council_chamber.analysis_execution, /* @__PURE__ */ new Set([analysisDesign]), "updates.council_chamber.analysis_execution", "OWNERSHIP_VIOLATION");
          validateChamberPatch(updates.council_chamber.analysis_execution[analysisDesign], analysisDesign, true);
        } else {
          assertKnownKeys(updates.council_chamber, /* @__PURE__ */ new Set([chamberRoute]), "updates.council_chamber", "OWNERSHIP_VIOLATION");
          validateChamberPatch(updates.council_chamber[chamberRoute], chamberRoute, false);
        }
      }
    }
    function applyScopeTransition(state, operation, actor, updates, transition, artifactRole) {
      const isAnalysis = actor.startsWith("analysis_execution.");
      const isReport = actor === "report_writer";
      const hasArtifact = artifactRole !== null;
      if (!isAnalysis && !isReport) {
        if (transition !== void 0 && transition !== null) fail("INVALID_INPUT", `${actor} cannot use scope_transition`);
        return;
      }
      if (!["new", "revise", "preserve"].includes(transition)) {
        fail("INVALID_INPUT", `${actor} apply requires scope_transition: new, revise, or preserve`);
      }
      let current;
      let patch;
      if (isAnalysis) {
        const design = actor.slice("analysis_execution.".length);
        current = state.council_chamber.analysis_execution[design] || {
          scope_id: null,
          scope_revision: 0
        };
        patch = updates.council_chamber && updates.council_chamber.analysis_execution ? updates.council_chamber.analysis_execution[design] : null;
        if (!patch) fail("INVALID_INPUT", "analysis scope transition requires a matching chamber patch");
      } else {
        current = state.report_assembly;
        patch = updates.report_assembly;
        if (!patch) fail("INVALID_INPUT", "report scope transition requires a report_assembly patch");
      }
      let submittedAnalysisContract;
      if (isAnalysis && Object.prototype.hasOwnProperty.call(patch, "execution_contract")) {
        submittedAnalysisContract = patch.execution_contract === null ? null : normalizeAnalysisContract(
          patch.execution_contract,
          `updates.council_chamber.${actor}.execution_contract`
        );
        patch.execution_contract = submittedAnalysisContract;
      }
      const submittedReportEvidence = isReport && Object.prototype.hasOwnProperty.call(patch, "analysis_artifact_ids");
      if (submittedReportEvidence) {
        patch.analysis_artifact_ids = normalizeAnalysisArtifactIds(
          patch.analysis_artifact_ids,
          "updates.report_assembly.analysis_artifact_ids"
        );
      }
      const nextReportStatus = isReport && updates.council_chamber && updates.council_chamber.report_writer ? updates.council_chamber.report_writer.current_status : void 0;
      if (isReport && ["new", "revise"].includes(transition) && nextReportStatus === "ready" && !submittedReportEvidence) {
        fail(
          "INVALID_INPUT",
          "new or revised ready report scope requires explicit analysis_artifact_ids; use [] for an intentional planning report"
        );
      }
      const hasCurrentIdentity = isUuid(current.scope_id) && Number.isInteger(current.scope_revision) && current.scope_revision >= 1;
      if (isAnalysis && hasCurrentIdentity && transition === "preserve" && current.support !== patch.support) {
        fail("SCOPE_MISMATCH", "changing analysis support requires scope_transition new or revise");
      }
      if (isReport && hasCurrentIdentity && transition === "preserve") {
        const changed = REPORT_SCOPE_MATERIAL_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field) && !deepEqual(patch[field], current[field]));
        if (changed.length) {
          fail(
            "SCOPE_MISMATCH",
            `changing preserved report scope fields requires scope_transition new or revise: ${changed.join(", ")}`
          );
        }
        patch.analysis_artifact_ids = clone(current.analysis_artifact_ids);
      }
      if (operation.scope_ref !== null) {
        if (current.scope_id !== operation.scope_ref.id || current.scope_revision !== operation.scope_ref.revision) {
          fail("SCOPE_MISMATCH", "the approved scope changed before worker apply");
        }
        if (transition !== "preserve") {
          const nextStatus = isAnalysis ? patch.current_status : nextReportStatus;
          if (hasArtifact || nextStatus === "done") {
            fail("SCOPE_MISMATCH", "output creation must preserve the exact approved scope");
          }
          if (!["ready", "blocked"].includes(nextStatus)) {
            fail("SCOPE_MISMATCH", "a material scope change must return a ready or blocked handoff without output");
          }
        }
      }
      if (isAnalysis) {
        if (transition === "preserve") {
          if (submittedAnalysisContract !== void 0 && !deepEqual(submittedAnalysisContract, current.execution_contract)) {
            fail("SCOPE_MISMATCH", "preserved analysis execution_contract must match the approved scope");
          }
          patch.execution_contract = clone(current.execution_contract);
          patch.causal_basis_hash = current.causal_basis_hash;
        } else if (patch.current_status === "ready" && submittedAnalysisContract === void 0) {
          fail("INVALID_INPUT", "new or revised ready analysis scope requires execution_contract");
        } else if (submittedAnalysisContract === void 0) {
          patch.execution_contract = null;
        }
        if (transition !== "preserve") {
          patch.causal_basis_hash = analysisCausalBasisHash(state);
        }
      }
      if (isReport && artifactRole === "infeasibility_evidence" && transition === "preserve" && Object.prototype.hasOwnProperty.call(patch, "current_format") && patch.current_format !== current.current_format) {
        fail("SCOPE_MISMATCH", "report infeasibility evidence cannot change the approved report format");
      }
      if (isReport && transition !== "preserve" && (transition === "new" || submittedReportEvidence || current.analysis_artifact_ids !== null)) {
        operation.report_evidence_binding_protocol = 1;
      }
      if (transition === "new") {
        patch.scope_id = crypto.randomUUID();
        patch.scope_revision = 1;
      } else {
        if (!isUuid(current.scope_id) || !Number.isInteger(current.scope_revision) || current.scope_revision < 1) {
          fail("SCOPE_MISMATCH", `cannot ${transition} a scope that has no current identity`);
        }
        patch.scope_id = current.scope_id;
        patch.scope_revision = current.scope_revision + (transition === "revise" ? 1 : 0);
      }
      operation.scope_ref = {
        kind: isAnalysis ? "analysis" : "report",
        id: patch.scope_id,
        revision: patch.scope_revision
      };
    }
    function emptyChamberSlot() {
      return {
        last_updated: null,
        current_status: null,
        summary: null,
        questions_for_user: [],
        feedback_to_route: []
      };
    }
    function emptyAnalysisSlot() {
      return {
        ...emptyChamberSlot(),
        scope_id: null,
        scope_revision: 0,
        support: null,
        execution_contract: null,
        causal_basis_hash: null
      };
    }
    function emptyReportAssembly() {
      return {
        last_updated: null,
        scope_id: null,
        scope_revision: 0,
        current_format: null,
        report_goal: null,
        audience: null,
        target_section: null,
        planned_structure: [],
        key_points: [],
        wording_constraints: [],
        analysis_artifact_ids: [],
        draft_notes: []
      };
    }
    function emptyDiscoverySidecar() {
      return {
        last_updated: null,
        scope_id: null,
        scope_revision: 0,
        execution_contract: null,
        status: "not_started",
        goal: null,
        scope: null,
        method_summary: null,
        findings: [],
        diagnostics: [],
        limitations: [],
        artifact_refs: [],
        reviewer_requests: []
      };
    }
    function resetNewScopeState(state, actor, transition) {
      if (transition !== "new") return;
      if (actor.startsWith("analysis_execution.")) {
        const design = actor.slice("analysis_execution.".length);
        state.council_chamber.analysis_execution[design] = emptyAnalysisSlot();
      } else if (actor === "report_writer") {
        state.report_assembly = emptyReportAssembly();
        state.council_chamber.report_writer = emptyChamberSlot();
      }
    }
    function applyDiscoveryHandoff(state, operation, actor, updates, artifactRole) {
      if (actor !== "causal_discovery") return;
      const hasArtifact = artifactRole !== null;
      const snapshot = operation.discovery_scope;
      const patch = updates.discovery_sidecar;
      const currentBound = isUuid(state.discovery_sidecar.scope_id) && Number.isInteger(state.discovery_sidecar.scope_revision) && state.discovery_sidecar.scope_revision >= 1 && state.discovery_sidecar.execution_contract !== null;
      const chamberPatch = updates.council_chamber.causal_discovery;
      const legacyUncontractedReservation = snapshot === null && operation.scope_ref === null && operation.artifact_intent !== null;
      if (!patch) {
        if (legacyUncontractedReservation) {
          if (chamberPatch.current_status !== "blocked") {
            fail("SCOPE_MISMATCH", "an uncontracted legacy discovery reservation must close as chamber-only blocked");
          }
          return;
        }
        if (snapshot !== null || !currentBound) {
          fail("INVALID_INPUT", "causal_discovery apply requires a discovery_sidecar update");
        }
        if (!["reviewed", "blocked"].includes(chamberPatch.current_status)) {
          fail("SCOPE_MISMATCH", "an unbound discovery handoff against a current scope must be chamber-only reviewed or blocked");
        }
        return;
      }
      if (legacyUncontractedReservation) {
        fail("SCOPE_MISMATCH", "an uncontracted legacy discovery reservation cannot alter the durable sidecar");
      }
      if (snapshot === null && currentBound) {
        fail("SCOPE_MISMATCH", "unbound discovery work cannot alter the current bound sidecar");
      }
      if (!Object.prototype.hasOwnProperty.call(patch, "status")) {
        fail("INVALID_INPUT", "causal_discovery apply requires discovery_sidecar.status");
      }
      assertEnum(
        patch.status,
        ["scoped", "artifact_created", "reviewed", "blocked"],
        "updates.discovery_sidecar.status",
        "INVALID_INPUT"
      );
      const hasReservation = operation.artifact_intent !== null;
      if (hasArtifact) {
        if (snapshot === null || operation.scope_ref === null) {
          fail("SCOPE_MISMATCH", "a discovery artifact requires a frozen discovery scope");
        }
        const requiredStatus = artifactRole === "completion" ? "artifact_created" : "blocked";
        if (patch.status !== requiredStatus || chamberPatch.current_status !== requiredStatus) {
          fail(
            "SCOPE_MISMATCH",
            `a discovery ${artifactRole} artifact requires sidecar and chamber status ${requiredStatus}`
          );
        }
      } else if (patch.status === "artifact_created") {
        fail("SCOPE_MISMATCH", "status artifact_created requires a completed discovery artifact");
      }
      if (hasReservation && !hasArtifact && patch.status !== "blocked") {
        fail("SCOPE_MISMATCH", "a reserved discovery run must publish its artifact or return blocked");
      }
      if (!hasReservation && snapshot !== null && snapshot.transition === "preserve" && !["reviewed", "blocked"].includes(patch.status)) {
        fail("SCOPE_MISMATCH", "an exact-scope discovery handoff without output must be reviewed or blocked");
      }
      if (!hasReservation && snapshot !== null && ["new", "revise"].includes(snapshot.transition) && !["scoped", "blocked"].includes(patch.status)) {
        fail("SCOPE_MISMATCH", "a no-output new or revised discovery handoff must be scoped or blocked");
      }
      if (patch.status === "scoped" && snapshot === null) {
        fail("SCOPE_MISMATCH", "status scoped requires a complete discovery contract");
      }
      if (snapshot !== null) {
        if (["new", "revise"].includes(snapshot.transition)) {
          state.discovery_sidecar = emptyDiscoverySidecar();
          state.council_chamber.causal_discovery = emptyChamberSlot();
        }
        patch.scope_id = operation.scope_ref.id;
        patch.scope_revision = operation.scope_ref.revision;
        patch.execution_contract = clone(snapshot.contract);
      }
      if (hasArtifact) {
        const refs = [
          ...state.discovery_sidecar.artifact_refs,
          ...patch.artifact_refs ?? [],
          operation.artifact_intent.location
        ];
        patch.artifact_refs = [...new Set(refs)];
      }
    }
    function validateScopeCompletion(state, actor, updates, artifactRole) {
      const isAnalysis = actor.startsWith("analysis_execution.");
      const isReport = actor === "report_writer";
      if (!isAnalysis && !isReport) return;
      const status = isAnalysis ? state.council_chamber.analysis_execution[actor.slice("analysis_execution.".length)].current_status : state.council_chamber.report_writer.current_status;
      if (artifactRole === null) {
        if (status === "done") {
          fail("SCOPE_MISMATCH", `${actor} current_status done requires a completion artifact`);
        }
        return;
      }
      const requiredStatus = artifactRole === "completion" ? "done" : "blocked";
      if (status !== requiredStatus) {
        fail(
          "SCOPE_MISMATCH",
          `${actor} ${artifactRole} artifact requires current_status ${requiredStatus}`
        );
      }
      if (isReport) {
        const chamberPatch = updates.council_chamber && updates.council_chamber.report_writer;
        if (!chamberPatch || chamberPatch.current_status !== requiredStatus) {
          fail("SCOPE_MISMATCH", `report output requires an explicit transition to ${requiredStatus}`);
        }
        if (artifactRole === "completion" && state.report_assembly.current_format !== "html") {
          fail("SCOPE_MISMATCH", "report completion requires report_assembly.current_format html");
        }
      }
    }
    function validateCausalCheckReadiness(state, actor, updates, previousState = null) {
      if (actor !== "causal_check") return;
      const patch = updates.causal_facts || {};
      const decisionFields = [
        "analysis_readiness",
        "support_status",
        "recommended_checks",
        "recommended_method_routes",
        "analysis_options"
      ];
      const reassessmentTriggers = [
        "causal_checked",
        "causal_question",
        "exposure_or_intervention",
        "outcome",
        "estimand",
        "assumptions",
        "threats",
        ...decisionFields
      ];
      const reassessed = reassessmentTriggers.some((field) => Object.hasOwn(patch, field));
      if (!reassessed) return;
      const missing = decisionFields.filter((field) => !Object.hasOwn(patch, field));
      if (missing.length) {
        fail("INVALID_INPUT", `causal_check readiness reassessment requires the complete decision bundle; missing: ${missing.join(", ")}`);
      }
      const readiness = state.causal_facts.analysis_readiness;
      const recommendations = state.causal_facts.recommended_method_routes;
      const analysisOptions = state.causal_facts.analysis_options;
      assertEnum(readiness, ["ready", "limited", "not_ready", "blocked"], "causal_facts.analysis_readiness", "INVALID_INPUT");
      assertStringOrNull(state.causal_facts.support_status, "causal_facts.support_status", "INVALID_INPUT");
      assertStringArray(state.causal_facts.recommended_checks, "causal_facts.recommended_checks", "INVALID_INPUT");
      assertArray(recommendations, "causal_facts.recommended_method_routes", "INVALID_INPUT");
      assertArray(analysisOptions, "causal_facts.analysis_options", "INVALID_INPUT");
      recommendations.forEach((route, index) => assertObject(
        route,
        `causal_facts.recommended_method_routes[${index}]`,
        "INVALID_INPUT"
      ));
      const designRoutes = recommendations.filter((route) => route.category === "design");
      const supportRoutes = recommendations.filter((route) => route.category === "support");
      const preferredOptions = analysisOptions.filter((option) => option.role === "preferred");
      const targetFields = [
        "causal_question",
        "exposure_or_intervention",
        "outcome",
        "estimand"
      ];
      const targetChanged = previousState !== null && targetFields.some((field) => Object.hasOwn(patch, field) && !deepEqual(previousState.causal_facts[field], state.causal_facts[field]));
      if (targetChanged && (previousState.causal_facts.analysis_options.length > 0 || previousState.causal_facts.recommended_method_routes.length > 0) && deepEqual(analysisOptions, previousState.causal_facts.analysis_options) && deepEqual(recommendations, previousState.causal_facts.recommended_method_routes)) {
        fail(
          "INVALID_INPUT",
          "a changed causal target requires a rebuilt or cleared strategy portfolio"
        );
      }
      if (["ready", "limited"].includes(readiness) && designRoutes.length !== 1) {
        fail("INVALID_INPUT", "causal_check apply with analysis_readiness ready or limited requires one recommended design route");
      }
      if (["ready", "limited"].includes(readiness)) {
        if (preferredOptions.length !== 1) {
          fail("INVALID_INPUT", "causal_check apply with analysis_readiness ready or limited requires exactly one preferred analysis option");
        }
        const preferred = preferredOptions[0];
        const expectedSupport = supportRoutes[0]?.id ?? null;
        if (preferred.design !== designRoutes[0].id || (preferred.support ?? null) !== expectedSupport) {
          fail("INVALID_INPUT", "the preferred analysis option must mirror the recommended design and support routes");
        }
      }
      if (["not_ready", "blocked"].includes(readiness) && recommendations.length) {
        fail("INVALID_INPUT", "causal_check apply with analysis_readiness not_ready or blocked requires empty method recommendations");
      }
      if (["not_ready", "blocked"].includes(readiness) && preferredOptions.length) {
        fail(
          "INVALID_INPUT",
          "causal_check apply with analysis_readiness not_ready or blocked cannot name a preferred analysis option"
        );
      }
      if (readiness === "ready" && designRoutes[0] && designRoutes[0].id === "descriptive_association") {
        fail("INVALID_INPUT", "descriptive_association requires analysis_readiness limited");
      }
    }
    function stampWorkerUpdates(updates, actor, timestamp) {
      const roots = Object.keys(updates).filter((key) => key !== "council_chamber");
      for (const root of roots) updates[root].last_updated = timestamp;
      if (updates.council_chamber) {
        if (actor.startsWith("analysis_execution.")) {
          const design = actor.slice("analysis_execution.".length);
          updates.council_chamber.analysis_execution[design].last_updated = timestamp;
        } else {
          updates.council_chamber[actor].last_updated = timestamp;
        }
      }
    }
    function normalizeCompletedHandoff(updates, actor, artifact) {
      if (artifact === null || artifact.artifact_role !== "completion") return;
      const summary = artifact.summary;
      if (actor.startsWith("analysis_execution.")) {
        const design = actor.slice("analysis_execution.".length);
        const patch = updates.council_chamber.analysis_execution[design];
        patch.summary = summary;
        patch.questions_for_user = [];
      } else if (actor === "report_writer") {
        const patch = updates.council_chamber.report_writer;
        patch.summary = summary;
        patch.questions_for_user = [];
      }
    }
    function appendArtifactRecord(state, projectRoot, operation, actor, artifact, packet) {
      const summary = artifact.summary;
      const { manifest, artifact_role: artifactRole } = validateManifest(projectRoot, operation, actor, packet, artifact);
      if ((actor === "report_writer" || actor.startsWith("analysis_execution.")) && operation.scope_ref === null) {
        fail("SCOPE_MISMATCH", `${actor} output requires an exact approved scope_ref`);
      }
      if (summary !== manifest.summary.trim()) {
        fail("INVALID_ARTIFACT_MANIFEST", "artifact summary must match the completion manifest summary");
      }
      if (state.artifact_records.some((record2) => record2.operation_id === operation.id)) {
        fail("DUPLICATE_ARTIFACT", "this operation already has an artifact record");
      }
      const planInfo = validatePlan(state.next_step_plan);
      const record = {
        artifact_id: crypto.randomUUID(),
        operation_id: operation.id,
        route: expectedArtifactRoute(actor),
        location: operation.artifact_intent.location,
        created_at: nowIso(),
        summary,
        artifact_role: artifactRole
      };
      if (actor.startsWith("analysis_execution.")) {
        record.design = planInfo.design;
        record.support = planInfo.support;
      }
      state.artifact_records.push(record);
      return record;
    }
    function applyWorker({
      projectRoot,
      payload,
      contextProtocol = null
    }) {
      const { statePath, state } = loadCurrentState(projectRoot);
      assertExpected(state, payload);
      const allowedInput = /* @__PURE__ */ new Set([
        "expected_project_id",
        "expected_revision",
        "operation_id",
        "actor",
        "updates",
        "scope_transition",
        "discovery_scope",
        "artifact"
      ]);
      assertKnownKeys(payload, allowedInput, "apply input", "INVALID_INPUT");
      const selectedContextProtocol = normalizeContextProtocol(
        contextProtocol,
        "apply context protocol"
      );
      const operation = assertOperation(state, payload, "worker_pending");
      const planInfo = validatePlan(state.next_step_plan);
      if (payload.actor !== planInfo.actor) fail("PLAN_MISMATCH", `apply actor must be ${planInfo.actor}`);
      const previousPacket = operationPacket(state, operation, planInfo);
      validateOwnedUpdates(payload.actor, payload.updates);
      const updates = clone(payload.updates);
      const hasArtifact = payload.artifact !== void 0 && payload.artifact !== null;
      if (payload.actor === "report_writer" && hasArtifact) {
        assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
      }
      if (payload.discovery_scope !== void 0) {
        if (payload.actor !== "causal_discovery") {
          fail("OWNERSHIP_VIOLATION", `${payload.actor} cannot set discovery_scope`);
        }
        if (hasArtifact || operation.artifact_intent !== null) {
          fail(
            "SCOPE_MISMATCH",
            "apply may bind discovery_scope only before output is reserved and without an artifact"
          );
        }
        bindDiscoveryScope(state, operation, payload.discovery_scope, "apply discovery_scope");
      }
      const hadApprovedScope = operation.scope_ref !== null;
      const workerPacket = operationPacket(state, operation, planInfo);
      const artifact = hasArtifact ? normalizeArtifactInput(payload.artifact, workerPacket) : null;
      const artifactRole = artifact === null ? null : artifact.artifact_role;
      if (hasArtifact && operation.artifact_intent !== null) {
        const frozenStatus = inspectReservedArtifact(projectRoot, operation, payload.actor, workerPacket);
        if (frozenStatus.location_state === "complete") {
          validateManifest(projectRoot, operation, payload.actor, workerPacket, artifact);
        } else if (frozenStatus.location_state === "invalid" && frozenStatus.reason_code === "MISSING_ARTIFACT") {
          fail("MISSING_ARTIFACT", "the reserved artifact disappeared during validation");
        }
      }
      if (hasArtifact && (payload.actor === "report_writer" || payload.actor.startsWith("analysis_execution.")) && !hadApprovedScope) {
        fail("SCOPE_MISMATCH", `${payload.actor} cannot publish output without the scope_ref bound by begin`);
      }
      if (payload.actor.startsWith("analysis_execution.")) {
        const design = payload.actor.slice("analysis_execution.".length);
        const chamberPatch = updates.council_chamber && updates.council_chamber.analysis_execution && updates.council_chamber.analysis_execution[design];
        if (!chamberPatch) fail("INVALID_INPUT", "analysis apply requires its matching chamber handoff");
        assertScopeHandoffStatus(chamberPatch, `updates.council_chamber.analysis_execution.${design}`);
        if (chamberPatch.support !== void 0 && chamberPatch.support !== planInfo.support) {
          fail("SCOPE_MISMATCH", "analysis chamber support must match the planned support route");
        }
        chamberPatch.support = planInfo.support;
      } else if (payload.actor === "report_writer") {
        const chamberPatch = updates.council_chamber && updates.council_chamber.report_writer;
        if (!chamberPatch) fail("INVALID_INPUT", "report apply requires its matching chamber handoff");
        assertScopeHandoffStatus(chamberPatch, "updates.council_chamber.report_writer");
      } else {
        const chamberPatch = updates.council_chamber && updates.council_chamber[payload.actor];
        if (!chamberPatch) fail("INVALID_INPUT", `${payload.actor} apply requires its matching chamber handoff`);
        assertCoreHandoffStatus(chamberPatch, `updates.council_chamber.${payload.actor}`);
      }
      applyScopeTransition(
        state,
        operation,
        payload.actor,
        updates,
        payload.scope_transition,
        artifactRole
      );
      resetNewScopeState(state, payload.actor, payload.scope_transition);
      applyDiscoveryHandoff(state, operation, payload.actor, updates, artifactRole);
      normalizeCompletedHandoff(updates, payload.actor, artifact);
      stampWorkerUpdates(updates, payload.actor, nowIso());
      const merged = deepMerge(state, updates);
      const mergedOperation = merged.state_meta.active_operation;
      if (!hasArtifact && ["new", "revise"].includes(payload.scope_transition) && (payload.actor === "report_writer" || payload.actor.startsWith("analysis_execution."))) {
        setOperationProtocol(merged, mergedOperation, planInfo);
      }
      const completionPacket = operationPacket(merged, mergedOperation, planInfo);
      validateCausalCheckReadiness(merged, payload.actor, updates, state);
      validateScopeCompletion(merged, payload.actor, updates, artifactRole);
      if (payload.actor === "report_writer" && merged.council_chamber.report_writer.current_status === "ready") {
        assertBoundReportAnalysisArtifactsAvailable(projectRoot, merged);
      }
      const abandonedLegacyDiscoveryArtifact = payload.actor === "causal_discovery" && operation.discovery_scope === null && operation.scope_ref === null && !hasArtifact && updates.council_chamber.causal_discovery.current_status === "blocked";
      let artifactRecord = null;
      if (hasArtifact) {
        if (!operation.artifact_intent) fail("MISSING_ARTIFACT", "artifact output was not reserved");
        if (merged.artifact_records.some((record) => record.operation_id === operation.id)) {
          fail("DUPLICATE_ARTIFACT", "this operation already has an artifact record");
        }
        publishReservedArtifact(projectRoot, mergedOperation, payload.actor, artifact, completionPacket);
        artifactRecord = appendArtifactRecord(
          merged,
          projectRoot,
          mergedOperation,
          payload.actor,
          artifact,
          completionPacket
        );
      } else if (operation.artifact_intent && !abandonedLegacyDiscoveryArtifact) {
        const artifactStatus2 = inspectReservedArtifact(projectRoot, mergedOperation, payload.actor, completionPacket);
        if (!["absent", "temp-only"].includes(artifactStatus2.location_state)) {
          if (artifactStatus2.location_state === "collision") {
            fail("ARTIFACT_COLLISION", "the reserved artifact locations are in conflict and cannot be left unrecorded");
          }
          if (artifactStatus2.location_state === "invalid" && artifactStatus2.reason_code !== "MISSING_ARTIFACT") {
            fail(artifactStatus2.reason_code, "the reserved final artifact is invalid and cannot be left unrecorded");
          }
          fail("MISSING_ARTIFACT_RECORD", "a reserved final artifact must be completed and recorded by apply");
        }
      }
      if (deriveSummaryAggregates(merged)) merged.project_summary.last_updated = nowIso();
      merged.state_meta.active_operation.stage = "lead_pending";
      const leadPacket = operationPacket(merged, merged.state_meta.active_operation, planInfo);
      const artifactStatus = mergedOperation.artifact_intent ? inspectReservedArtifact(projectRoot, mergedOperation, payload.actor, leadPacket) : null;
      const warnings = artifactWarnings(projectRoot, merged);
      const revision = commitMutation(statePath, merged);
      const context = contextForCurrentStage(
        merged,
        planInfo,
        warnings,
        artifactStatus,
        selectedContextProtocol
      );
      return {
        ok: true,
        code: "WORKER_APPLIED",
        project_id: merged.state_meta.project_id,
        revision,
        operation_id: operation.id,
        stage: "lead_pending",
        artifact_record: artifactRecord,
        ...operationPacketResult(previousPacket, leadPacket),
        ...context
      };
    }
    function deriveSummaryAggregates(state) {
      const hasArtifact = (route) => state.artifact_records.some(
        (record) => record.route === route && record.artifact_role === "completion"
      );
      const coreComplete = {
        data_audit_complete: ["passing", "limited"].includes(state.data_facts.data_checked),
        domain_knowledge_complete: ["passing", "limited"].includes(state.domain_knowledge.domain_checked),
        causal_check_complete: ["passing", "limited"].includes(state.causal_facts.causal_checked)
      };
      const derived = {
        ...coreComplete,
        exploration_complete: Object.values(coreComplete).every(Boolean),
        analysis_output: hasArtifact("analysis_execution") ? "exist" : "non_exist",
        report_output: hasArtifact("report_writer") ? "exist" : "non_exist"
      };
      const changed = Object.entries(derived).some(([field, value]) => state.project_summary[field] !== value);
      Object.assign(state.project_summary, derived);
      return changed;
    }
    function plannedScopeStatus(state) {
      const actor = validatePlan(state.next_step_plan).actor;
      return actor && actor.startsWith("analysis_execution.") ? state.council_chamber.analysis_execution[actor.slice("analysis_execution.".length)].current_status : actor === "report_writer" ? state.council_chamber.report_writer.current_status : null;
    }
    function rejectReadyScopeSummaryUpdate(state, updates) {
      if (!updates.project_summary || !Object.prototype.hasOwnProperty.call(updates.project_summary, "exploration_summary")) return;
      if (plannedScopeStatus(state) === "ready" && !deepEqual(updates.project_summary.exploration_summary, state.project_summary.exploration_summary)) {
        fail(
          "OWNERSHIP_VIOLATION",
          "a ready analysis or report scope remains route-owned and cannot update project_summary.exploration_summary"
        );
      }
    }
    function rejectReadyScopeMenu(state, presentation, cancel) {
      if (presentation.options.some((option) => option.assignment.scope_ref !== null && ["analysis", "report"].includes(option.assignment.scope_ref.kind))) {
        fail("INVALID_INPUT", "an exact ready analysis or report scope requires direct approval, not a numbered option");
      }
      const planInfo = validatePlan(state.next_step_plan);
      const unresolvedReportRepair = planInfo.actor === "report_writer" && state.report_assembly.analysis_artifact_ids === null;
      if (cancel || plannedScopeStatus(state) !== "ready" || unresolvedReportRepair) return;
      if (presentation.options.length > 0 || presentation.direct_assignment === null) {
        fail(
          "INVALID_INPUT",
          "a ready analysis or report handoff must persist one direct approval assignment without options"
        );
      }
      const expectedRoute = planInfo.actor;
      const expectedScope = state.state_meta.active_operation.scope_ref;
      if (presentation.direct_assignment.route !== expectedRoute || presentation.direct_assignment.support !== planInfo.support || !deepEqual(presentation.direct_assignment.scope_ref, expectedScope)) {
        fail("INVALID_INPUT", "direct approval assignment must bind the exact ready scope and support");
      }
    }
    function normalizePresentation(state, presentation) {
      const fields = [
        "confirmation",
        "framing",
        "options",
        "boundary",
        "next_steps",
        "direct_assignment"
      ];
      assertKnownKeys(presentation, new Set(fields), "finish presentation", "INVALID_INPUT");
      const missing = fields.filter((field) => !Object.prototype.hasOwnProperty.call(presentation, field));
      if (missing.length) fail("INVALID_INPUT", `finish presentation is missing: ${missing.join(", ")}`);
      let confirmation = null;
      if (presentation.confirmation !== null) {
        confirmation = normalizeResponseText(
          presentation.confirmation,
          "finish presentation.confirmation",
          true
        );
      }
      const framing = normalizeResponseText(
        presentation.framing,
        "finish presentation.framing",
        false,
        MAX_RESPONSE_FRAMING_LENGTH
      );
      const boundary = normalizeResponseText(presentation.boundary, "finish presentation.boundary");
      const suppliedNextSteps = normalizeResponseText(
        presentation.next_steps,
        "finish presentation.next_steps",
        true
      );
      assertArray(presentation.options, "finish presentation.options", "INVALID_INPUT");
      if (presentation.options.length === 1 || presentation.options.length > 4) {
        fail("INVALID_INPUT", "finish presentation.options must contain 0 or 2-4 choices");
      }
      const options = presentation.options.map((option, index) => {
        const label = `finish presentation.options[${index}]`;
        assertKnownKeys(
          option,
          /* @__PURE__ */ new Set(["label", "consultant_read", "tradeoff", "assignment"]),
          label,
          "INVALID_INPUT"
        );
        const required = ["label", "consultant_read", "tradeoff", "assignment"];
        const missingOptionFields = required.filter(
          (field) => !Object.prototype.hasOwnProperty.call(option, field)
        );
        if (missingOptionFields.length) {
          fail("INVALID_INPUT", `${label} is missing: ${missingOptionFields.join(", ")}`);
        }
        return {
          label: normalizeResponseText(option.label, `${label}.label`, true),
          consultant_read: normalizeResponseText(
            option.consultant_read,
            `${label}.consultant_read`,
            true
          ),
          tradeoff: normalizeResponseText(option.tradeoff, `${label}.tradeoff`, true),
          assignment: normalizeAssignment(state, option.assignment, `${label}.assignment`).assignment
        };
      });
      const normalizedLabels = options.map((option) => option.label.toLowerCase());
      if (new Set(normalizedLabels).size !== normalizedLabels.length) {
        fail("INVALID_INPUT", "finish presentation.options must contain distinct labels");
      }
      if (hasDuplicateAssignments(options)) {
        fail("INVALID_INPUT", "finish presentation.options must contain distinct assignments");
      }
      const directAssignment = presentation.direct_assignment === void 0 || presentation.direct_assignment === null ? null : normalizeAssignment(
        state,
        presentation.direct_assignment,
        "finish presentation.direct_assignment"
      ).assignment;
      if (options.length > 0 && directAssignment !== null) {
        fail("INVALID_INPUT", "finish presentation cannot contain both options and a direct_assignment");
      }
      return {
        confirmation,
        framing,
        options,
        boundary,
        next_steps: options.length ? MENU_NEXT_STEPS : suppliedNextSteps,
        direct_assignment: directAssignment
      };
    }
    function decisionFromPresentation(presentation, operationId) {
      if (presentation.options.length === 0) return null;
      return {
        decision_id: crypto.randomUUID(),
        source_operation_id: operationId,
        created_at: nowIso(),
        options: presentation.options.map((option, index) => ({
          number: index + 1,
          assignment: clone(option.assignment)
        }))
      };
    }
    function renderPresentation(presentation, includeWelcome) {
      const blocks = [];
      if (presentation.confirmation !== null) {
        blocks.push(`[OK Confirmed] ${presentation.confirmation}`);
      }
      if (includeWelcome) blocks.push(WELCOME_LINE);
      blocks.push(`[> Framing]
${presentation.framing}`);
      if (presentation.options.length) {
        const optionLines = ["[+ Consultant Options]"];
        presentation.options.forEach((option, index) => {
          optionLines.push(
            `    ${index + 1}. ${option.label}`,
            `       Consultant read: ${option.consultant_read}`,
            `       Tradeoff: ${option.tradeoff}`
          );
        });
        blocks.push(optionLines.join("\n"));
      }
      blocks.push(`[! Boundary]
${presentation.boundary}`);
      blocks.push(`[? Next Steps]
${presentation.next_steps}`);
      return blocks.join("\n\n");
    }
    function finishOperation({ projectRoot, payload, cancel = false }) {
      const { statePath, state } = loadCurrentState(projectRoot);
      assertExpected(state, payload);
      const allowedInput = /* @__PURE__ */ new Set([
        "expected_project_id",
        "expected_revision",
        "operation_id",
        "updates",
        "presentation"
      ]);
      assertKnownKeys(payload, allowedInput, "finish input", "INVALID_INPUT");
      const operation = assertOperation(state, payload, cancel ? null : "lead_pending");
      const planInfo = validatePlan(state.next_step_plan);
      if (!cancel && planInfo.actor === "report_writer" && operation.report_evidence_binding_protocol === 1) {
        assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
      }
      if (!Object.prototype.hasOwnProperty.call(payload, "presentation")) {
        fail("INVALID_INPUT", "finish input requires presentation");
      }
      const updates = payload.updates ?? {};
      assertObject(updates, "updates", "INVALID_INPUT");
      if (cancel && Object.keys(updates).length > 0) {
        fail("OWNERSHIP_VIOLATION", "finish --cancel preserves durable state and does not accept updates");
      }
      assertKnownKeys(updates, /* @__PURE__ */ new Set(["project_summary"]), "finish updates", "OWNERSHIP_VIOLATION");
      if (updates.project_summary !== void 0) {
        assertKnownKeys(
          updates.project_summary,
          SECTION_KEYS.project_summary,
          "updates.project_summary",
          "OWNERSHIP_VIOLATION"
        );
        rejectControllerFields(
          updates.project_summary,
          "updates.project_summary",
          ["last_updated", ...DERIVED_SUMMARY_FIELDS]
        );
      }
      rejectReadyScopeSummaryUpdate(state, updates);
      const startupNotice = state.state_meta.startup_notice;
      const previousSummary = clone(state.project_summary);
      const merged = deepMerge(state, updates);
      deriveSummaryAggregates(merged);
      if (!deepEqual(previousSummary, merged.project_summary)) merged.project_summary.last_updated = nowIso();
      merged.next_step_plan = [];
      merged.state_meta.active_operation = null;
      merged.state_meta.startup_notice = null;
      merged.pending_decision = null;
      const presentation = normalizePresentation(merged, payload.presentation);
      rejectReadyScopeMenu(state, presentation, cancel);
      merged.pending_decision = decisionFromPresentation(presentation, operation.id);
      const responseMarkdown = renderPresentation(
        presentation,
        startupNotice !== null
      );
      merged.response_receipt = {
        operation_id: operation.id,
        revision: merged.state_meta.revision + 1,
        created_at: nowIso(),
        response_markdown: responseMarkdown,
        direct_assignment: clone(presentation.direct_assignment)
      };
      const revision = commitMutation(statePath, merged);
      return {
        ok: true,
        code: cancel ? "OPERATION_CANCELLED" : "OPERATION_FINISHED",
        project_id: merged.state_meta.project_id,
        revision,
        operation_id: operation.id,
        mode: "idle",
        operation_packet: null,
        next_action: "emit_response_markdown_verbatim_and_stop",
        pending_decision: merged.pending_decision,
        direct_assignment: clone(merged.response_receipt.direct_assignment),
        response_markdown: responseMarkdown
      };
    }
    function scopeSnapshot(state) {
      const analysis = {};
      for (const design of Object.keys(state.council_chamber.analysis_execution).sort()) {
        const slot = state.council_chamber.analysis_execution[design];
        if (slot.scope_id === null) continue;
        analysis[design] = {
          scope_id: slot.scope_id,
          scope_revision: slot.scope_revision,
          current_status: slot.current_status,
          support: slot.support,
          basis_current: slot.causal_basis_hash !== null && slot.causal_basis_hash === analysisCausalBasisHash(state),
          last_updated: slot.last_updated
        };
      }
      const report = state.report_assembly.scope_id === null ? null : {
        scope_id: state.report_assembly.scope_id,
        scope_revision: state.report_assembly.scope_revision,
        current_status: state.council_chamber.report_writer.current_status,
        last_updated: state.council_chamber.report_writer.last_updated
      };
      const discovery = state.discovery_sidecar.scope_id === null ? null : {
        scope_id: state.discovery_sidecar.scope_id,
        scope_revision: state.discovery_sidecar.scope_revision,
        status: state.discovery_sidecar.status,
        execution_contract: clone(state.discovery_sidecar.execution_contract),
        last_updated: state.discovery_sidecar.last_updated
      };
      return { analysis, report, discovery };
    }
    function responseHeadingBody(markdown, heading) {
      const start = markdown.indexOf(heading);
      if (start === -1) return null;
      const bodyStart = start + heading.length;
      let bodyEnd = markdown.length;
      for (const candidate of RESPONSE_HEADINGS) {
        if (candidate === heading) continue;
        const index = markdown.indexOf(`

${candidate}`, bodyStart);
        if (index !== -1 && index < bodyEnd) bodyEnd = index;
      }
      let body = markdown.slice(bodyStart, bodyEnd);
      if (body.startsWith("\n")) body = body.slice(1);
      body = body.trimEnd();
      return body || null;
    }
    function previousResponseCue(receipt) {
      if (receipt === null) return null;
      return {
        operation_id: receipt.operation_id,
        revision: receipt.revision,
        direct_assignment: clone(receipt.direct_assignment),
        consultant_options: responseHeadingBody(receipt.response_markdown, "[+ Consultant Options]"),
        boundary: responseHeadingBody(receipt.response_markdown, "[! Boundary]"),
        next_steps: responseHeadingBody(receipt.response_markdown, "[? Next Steps]")
      };
    }
    function routerStateProjection(state) {
      return {
        project_summary: clone(state.project_summary),
        core_status: {
          data_audit: {
            last_updated: state.data_facts.last_updated,
            data_checked: state.data_facts.data_checked,
            handoff: clone(state.council_chamber.data_audit)
          },
          domain_expert: {
            last_updated: state.domain_knowledge.last_updated,
            domain_checked: state.domain_knowledge.domain_checked,
            handoff: clone(state.council_chamber.domain_expert)
          },
          causal_check: {
            facts: clone(state.causal_facts),
            handoff: clone(state.council_chamber.causal_check)
          },
          causal_discovery: {
            sidecar: clone(state.discovery_sidecar),
            handoff: clone(state.council_chamber.causal_discovery)
          }
        },
        analysis_execution: clone(state.council_chamber.analysis_execution),
        report: {
          assembly: clone(state.report_assembly),
          handoff: clone(state.council_chamber.report_writer)
        },
        pending_decision: clone(state.pending_decision),
        artifact_records: clone(state.artifact_records)
      };
    }
    function isOutputBoundReportContext(state, planInfo) {
      const operation = state.state_meta.active_operation;
      return planInfo.actor === "report_writer" && operation !== null && operation.scope_ref !== null && Array.isArray(state.report_assembly.analysis_artifact_ids);
    }
    function visibleReportArtifactRecords(state, planInfo) {
      if (!isOutputBoundReportContext(state, planInfo)) return clone(state.artifact_records);
      const bound = new Set(state.report_assembly.analysis_artifact_ids ?? []);
      const operationId = state.state_meta.active_operation.id;
      return clone(state.artifact_records.filter((record) => record.route === "analysis_execution" ? bound.has(record.artifact_id) : record.route === "report_writer" ? record.operation_id === operationId : true));
    }
    function visibleReportArtifactWarnings(state, planInfo, warnings) {
      if (!isOutputBoundReportContext(state, planInfo)) return clone(warnings);
      const visibleIds = new Set(
        visibleReportArtifactRecords(state, planInfo).map((record) => record.artifact_id)
      );
      const recordIds = new Set(state.artifact_records.map((record) => record.artifact_id));
      return clone(warnings.filter((warning) => {
        return !recordIds.has(warning.artifact_id) || visibleIds.has(warning.artifact_id);
      }));
    }
    function workerCouncilProjection(state, planInfo) {
      const council = {
        data_audit: clone(state.council_chamber.data_audit),
        domain_expert: clone(state.council_chamber.domain_expert),
        causal_check: clone(state.council_chamber.causal_check),
        causal_discovery: clone(state.council_chamber.causal_discovery),
        analysis_execution: {},
        report_writer: clone(state.council_chamber.report_writer)
      };
      if (planInfo.actor === "report_writer" && !isOutputBoundReportContext(state, planInfo) || ["causal_check", "causal_discovery"].includes(planInfo.actor)) {
        council.analysis_execution = clone(state.council_chamber.analysis_execution);
      } else if (planInfo.design !== null) {
        const slot = state.council_chamber.analysis_execution[planInfo.design];
        if (slot !== void 0) council.analysis_execution[planInfo.design] = clone(slot);
      }
      return council;
    }
    function workerStateProjection(state, planInfo) {
      const projected = {
        project_summary: clone(state.project_summary),
        council_chamber: workerCouncilProjection(state, planInfo),
        data_facts: clone(state.data_facts),
        domain_knowledge: clone(state.domain_knowledge),
        causal_facts: clone(state.causal_facts),
        discovery_sidecar: clone(state.discovery_sidecar),
        artifact_records: planInfo.actor === "report_writer" ? visibleReportArtifactRecords(state, planInfo) : clone(state.artifact_records)
      };
      if (planInfo.actor === "report_writer") {
        projected.report_assembly = clone(state.report_assembly);
        if (isOutputBoundReportContext(state, planInfo)) {
          projected.report_assembly.draft_notes = [];
        }
      }
      return projected;
    }
    function leadStateProjection(state, planInfo) {
      if (planInfo.actor !== "team_lead") return workerStateProjection(state, planInfo);
      return {
        project_summary: clone(state.project_summary),
        council_chamber: clone(state.council_chamber),
        data_facts: clone(state.data_facts),
        domain_knowledge: clone(state.domain_knowledge),
        causal_facts: clone(state.causal_facts),
        discovery_sidecar: clone(state.discovery_sidecar),
        report_assembly: clone(state.report_assembly),
        artifact_records: clone(state.artifact_records)
      };
    }
    function turnContext(state, planInfo, audience, warnings, artifactStatus = null) {
      const operation = state.state_meta.active_operation;
      const projected = audience === "router" ? routerStateProjection(state) : audience === "worker" ? workerStateProjection(state, planInfo) : leadStateProjection(state, planInfo);
      const snapshot = scopeSnapshot(state);
      if (audience !== "router" && isOutputBoundReportContext(state, planInfo)) {
        snapshot.analysis = {};
      }
      return {
        version: 1,
        audience,
        actor: audience === "router" ? null : planInfo.actor,
        project_id: state.state_meta.project_id,
        revision: state.state_meta.revision,
        stage: operation === null ? "idle" : operation.stage,
        startup_notice: clone(state.state_meta.startup_notice),
        operation: clone(operation),
        scope_snapshot: snapshot,
        state: projected,
        previous_response_cue: audience === "router" ? previousResponseCue(state.response_receipt) : null,
        artifact_status: clone(artifactStatus),
        artifact_warnings: audience !== "router" && planInfo.actor === "report_writer" ? visibleReportArtifactWarnings(state, planInfo, warnings) : clone(warnings)
      };
    }
    function phaseName(audience) {
      return audience === "team_lead" ? "lead" : audience;
    }
    function completionCommandForAudience(audience) {
      if (audience === "router") return "begin";
      if (audience === "worker") return "apply";
      return "finish";
    }
    function phaseCapsule(state, planInfo, audience, warnings, artifactStatus = null) {
      const context = turnContext(state, planInfo, audience, warnings, artifactStatus);
      const body = {
        protocol: PHASE_CAPSULE_PROTOCOL,
        version: PHASE_CAPSULE_VERSION,
        kind: "full",
        phase: phaseName(audience),
        turn_context: context,
        operation_packet: operationPacket(state, state.state_meta.active_operation, planInfo),
        required_references: requiredReferences(state, planInfo, audience, warnings),
        completion_command: completionCommandForAudience(audience)
      };
      const contextHash = sha256Hex(canonicalJson(body));
      return {
        ...body,
        context_id: `ctx-v${PHASE_CAPSULE_VERSION}-${contextHash}`
      };
    }
    function normalizeContextProtocol(value, label) {
      if (value === void 0 || value === null) return null;
      if (value !== PHASE_CAPSULE_PROTOCOL) {
        fail("INVALID_INPUT", `${label} must be ${PHASE_CAPSULE_PROTOCOL}`);
      }
      return value;
    }
    function requiredReferences(state, planInfo, audience, warnings) {
      const operation = state.state_meta.active_operation;
      const legacyProtocol = operation !== null && operation.completion_protocol === 1;
      if (audience === "router") return ["references/route_selection_workflow.md"];
      if (audience === "team_lead") {
        const references2 = ["references/team_lead.md"];
        if (planInfo.design !== null) references2.push("references/team_lead_analysis_flow.md");
        if (planInfo.actor === "report_writer") references2.push("references/team_lead_report_flow.md");
        if (legacyProtocol) references2.push("references/legacy_evidence.md");
        return references2;
      }
      const references = [];
      if (planInfo.design !== null) {
        references.push(
          "references/design_execution_contract.md",
          `references/design/${planInfo.design}.md`
        );
        if (planInfo.support !== null) references.push(`references/support/${planInfo.support}.md`);
      } else {
        references.push(`references/${planInfo.actor}.md`);
      }
      const outputBound = operation !== null && (operation.artifact_intent !== null || operation.scope_ref !== null && (planInfo.design !== null || planInfo.actor === "causal_discovery" || planInfo.actor === "report_writer" && Array.isArray(state.report_assembly.analysis_artifact_ids)));
      if (outputBound && planInfo.actor === "report_writer") {
        if (state.report_assembly.analysis_artifact_ids !== null) {
          references.push(
            state.report_assembly.analysis_artifact_ids.length > 0 ? "assets/report_template_analysis.md" : "assets/report_template_planning.md",
            "assets/report_html_layout_template.html"
          );
        }
      }
      if (outputBound) references.push("references/artifact_output_policy.md");
      if (legacyProtocol) references.push("references/legacy_evidence.md");
      return [...new Set(references)];
    }
    function contextForCurrentStage(state, planInfo, warnings, artifactStatus = null, contextProtocol = null) {
      const operation = state.state_meta.active_operation;
      const audience = operation === null ? "router" : operation.stage === "worker_pending" ? "worker" : "team_lead";
      if (contextProtocol === PHASE_CAPSULE_PROTOCOL) {
        return { phase_capsule: phaseCapsule(state, planInfo, audience, warnings, artifactStatus) };
      }
      return {
        turn_context: turnContext(state, planInfo, audience, warnings, artifactStatus),
        required_references: requiredReferences(state, planInfo, audience, warnings)
      };
    }
    function validateProject({ projectRoot }) {
      const root = path.resolve(projectRoot);
      const statePath = statePathFor(root);
      if (!fs.existsSync(statePath)) {
        return { ok: false, code: "MISSING_STATE", state_path: statePath, warnings: [] };
      }
      let state = parseYaml(readText(statePath), statePath);
      if (state.state_meta?.schema_version === 6) {
        state = upgradeV6State(state, root);
      }
      const { planInfo } = validateState(state);
      return {
        ok: true,
        code: "VALID",
        state_path: statePath,
        project_id: state.state_meta.project_id,
        revision: state.state_meta.revision,
        active_operation: state.state_meta.active_operation,
        operation_packet: operationPacket(state, state.state_meta.active_operation, planInfo),
        plan: state.next_step_plan,
        plan_actor: planInfo.actor,
        pending_decision: state.pending_decision,
        response_receipt: state.response_receipt,
        scope_snapshot: scopeSnapshot(state),
        warnings: artifactWarnings(root, state)
      };
    }
    function validateTemplate({ skillRoot }) {
      loadTemplate(skillRoot);
      return {
        ok: true,
        code: "VALID_TEMPLATE",
        schema_version: SCHEMA_VERSION,
        capabilities: {
          scope_snapshot: 1,
          response_rendering: 1,
          pending_decision: 1,
          response_receipt: 1,
          direct_assignment: 1,
          causal_scope_basis: 1,
          startup_notice: 1,
          discovery_contract: 1,
          analysis_contract: 1,
          completion_protocol: 1,
          artifact_roles: 1,
          analysis_options: 1,
          requirement_evidence: 1,
          turn_context: 1,
          required_references: 1,
          operation_packet_ref: 1,
          phase_capsule: 1,
          begin_artifact_reservation: 1,
          conditional_references: 1,
          report_evidence_binding: 1
        }
      };
    }
    module2.exports = {
      PHASE_CAPSULE_PROTOCOL,
      StateError,
      applyWorker,
      beginOperation,
      finishOperation,
      openProject,
      reserveArtifact,
      validateProject,
      validateTemplate
    };
  }
});

// scripts/statectl-src/hook-runner.cjs
var require_hook_runner = __commonJS({
  "scripts/statectl-src/hook-runner.cjs"(exports2, module2) {
    "use strict";
    var path = require("node:path");
    var fs = require("node:fs");
    var { StateError, validateProject } = require_core();
    function emit(value) {
      process.stdout.write(`${JSON.stringify(value)}
`);
    }
    function readInput() {
      try {
        const text = fs.readFileSync(0, "utf8").trim();
        return text ? JSON.parse(text) : {};
      } catch (_error) {
        return {};
      }
    }
    function firstPath(values) {
      const value = values.find((item) => typeof item === "string" && item.trim());
      return value ? value.trim() : null;
    }
    function nearestStateRoot(start) {
      let current = path.resolve(start);
      while (true) {
        if (fs.existsSync(path.join(current, "project_state.yaml"))) return current;
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
      }
    }
    function pathContains(root, candidate) {
      const relative = path.relative(path.resolve(root), path.resolve(candidate));
      return relative === "" || !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
    }
    function canonicalDirectory(candidate) {
      try {
        const resolved = fs.realpathSync.native(path.resolve(candidate));
        return fs.statSync(resolved).isDirectory() ? resolved : null;
      } catch (_error) {
        return null;
      }
    }
    function installedCodexProjectRoot(input, runtimeFile) {
      if (typeof runtimeFile !== "string" || !runtimeFile.trim()) return void 0;
      const resolvedFile = path.resolve(runtimeFile);
      const resolvedDirectory = path.dirname(resolvedFile);
      if (path.basename(resolvedDirectory) !== ".codex") return void 0;
      try {
        const fileStatus = fs.lstatSync(resolvedFile);
        const directoryStatus = fs.lstatSync(resolvedDirectory);
        if (!fileStatus.isFile() || fileStatus.isSymbolicLink() || directoryStatus.isSymbolicLink()) return null;
      } catch (_error) {
        return null;
      }
      const canonicalFile = fs.realpathSync.native(resolvedFile);
      const canonicalRuntimeDirectory = path.dirname(canonicalFile);
      if (path.basename(canonicalRuntimeDirectory) !== ".codex") return null;
      const projectRoot = canonicalDirectory(path.dirname(canonicalRuntimeDirectory));
      if (projectRoot === null) return null;
      const workingDirectories = [process.cwd()];
      if (input && typeof input.cwd === "string" && input.cwd.trim()) {
        workingDirectories.push(input.cwd.trim());
      }
      for (const workingDirectory of workingDirectories) {
        const canonicalWorkingDirectory = canonicalDirectory(workingDirectory);
        if (canonicalWorkingDirectory === null || !pathContains(projectRoot, canonicalWorkingDirectory)) {
          return null;
        }
      }
      return projectRoot;
    }
    function claudeProjectRoot(input) {
      const explicit = firstPath([
        input && typeof input.projectRoot === "string" ? input.projectRoot : null,
        process.env.CLAUDE_PROJECT_DIR
      ]);
      if (explicit) return path.resolve(explicit);
      const cwd = firstPath([
        input && typeof input.cwd === "string" ? input.cwd : null,
        process.env.PWD,
        process.cwd()
      ]) || process.cwd();
      return nearestStateRoot(cwd) || path.resolve(cwd);
    }
    function codexProjectRoot(input, runtimeFile) {
      const installedRoot = installedCodexProjectRoot(input, runtimeFile);
      if (installedRoot !== void 0) return installedRoot;
      const explicit = firstPath([
        input && typeof input.projectRoot === "string" ? input.projectRoot : null
      ]);
      if (explicit) return path.resolve(explicit);
      const cwd = firstPath([
        input && typeof input.cwd === "string" ? input.cwd : null,
        process.cwd(),
        process.env.PWD
      ]) || process.cwd();
      const activeRoot = nearestStateRoot(cwd);
      if (activeRoot) return activeRoot;
      const hostRoot = firstPath([process.env.CODEX_PROJECT_DIR]);
      if (hostRoot) {
        const resolvedHostRoot = nearestStateRoot(hostRoot) || path.resolve(hostRoot);
        if (pathContains(resolvedHostRoot, cwd)) return resolvedHostRoot;
      }
      return path.resolve(cwd);
    }
    function runHook2(host, options = {}) {
      if (host !== "claude" && host !== "codex") throw new Error(`unsupported hook host: ${host}`);
      try {
        const input = readInput();
        const stopHookActive = input && input.stop_hook_active === true;
        const projectRoot = host === "codex" ? codexProjectRoot(input, options.runtimeFile) : claudeProjectRoot(input);
        if (host === "codex" && projectRoot === null) return;
        const result = validateProject({ projectRoot });
        if (!result.ok && result.code === "MISSING_STATE") {
        } else if (result.active_operation !== null || result.plan.length > 0) {
          const stage = result.active_operation === null ? "planned" : result.active_operation.stage;
          const actor = result.plan_actor === null ? "unassigned" : result.plan_actor;
          if (stopHookActive) {
            emit({
              systemMessage: `causal-consultant operation remains unfinished (stage: ${stage}, actor: ${actor}); allowing stop after a prior block. The next causal-consultant turn resumes it, or cancel it explicitly.`,
              suppressOutput: true
            });
          } else {
            emit({
              decision: "block",
              reason: `causal-consultant operation is still active (stage: ${stage}, actor: ${actor}); run statectl open, resume it, and finish or cancel before stopping.`,
              systemMessage: "project_state.yaml contains an unfinished causal-consultant operation."
            });
          }
        } else if (result.warnings.length) {
          emit({
            systemMessage: `project_state.yaml is valid, with ${result.warnings.length} unavailable or incomplete artifact reference(s).`,
            suppressOutput: true
          });
        } else if (host === "claude") {
          emit({ suppressOutput: true });
        }
      } catch (error) {
        emit({
          systemMessage: error instanceof StateError ? `project_state.yaml failed strict validation (${error.code}); run causal-consultant preflight and report its recovery boundary.` : "project_state.yaml validation failed unexpectedly; run causal-consultant preflight before normal work.",
          suppressOutput: true
        });
      }
    }
    module2.exports = { runHook: runHook2 };
  }
});

// scripts/statectl-src/codex-hook.cjs
var { runHook } = require_hook_runner();
runHook("codex", { runtimeFile: __filename });
