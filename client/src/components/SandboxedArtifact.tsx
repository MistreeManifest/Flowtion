import { useRef, useEffect, useState } from "react";

interface SandboxedArtifactProps {
  html: string;
  /** Unique key to force re-render when artifact changes */
  artifactId: number;
}

/**
 * Renders LLM-generated HTML inside a sandboxed iframe.
 *
 * Why: The cast phase produces arbitrary HTML. Injecting it via
 * dangerouslySetInnerHTML gives that HTML full access to Flowtion's
 * DOM, cookies, and JS context. A sandboxed iframe isolates it —
 * the artifact lives in its own world, which is both safer and more
 * aligned with the "living artifact" metaphor.
 *
 * The iframe uses `srcdoc` with `sandbox="allow-scripts"`:
 *  - Scripts inside the artifact work (CSS animations, JS visuals)
 *  - No access to parent window, cookies, or same-origin APIs
 *  - No form submission, no popups, no top-navigation
 *
 * Auto-height: A small script inside the srcdoc posts its body height
 * to the parent via postMessage. The component listens and resizes
 * the iframe to fit, so there's no awkward scrollbar-within-scrollbar.
 */
export function SandboxedArtifact({ html, artifactId }: SandboxedArtifactProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  // Wrap the artifact HTML in a full document with:
  // 1. A dark background matching Flowtion's palette
  // 2. Reset styles so the artifact renders cleanly
  // 3. A height reporter that posts the content height to the parent
  const srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: #e0e0e0;
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    body { padding: 0; }
  </style>
</head>
<body>
  ${html}
  <script>
    function reportHeight() {
      var h = document.documentElement.scrollHeight;
      parent.postMessage({ type: 'flowtion-artifact-height', id: ${artifactId}, height: h }, '*');
    }
    // Report after load, after fonts, and on resize
    reportHeight();
    window.addEventListener('load', reportHeight);
    document.fonts && document.fonts.ready.then(reportHeight);
    new ResizeObserver(reportHeight).observe(document.body);
  </script>
</body>
</html>`;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data &&
        event.data.type === "flowtion-artifact-height" &&
        event.data.id === artifactId
      ) {
        const newHeight = Math.max(100, Math.min(event.data.height, 2000));
        setHeight(newHeight);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [artifactId]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      title="Artifact"
      style={{
        width: "100%",
        height: `${height}px`,
        border: "none",
        display: "block",
        borderRadius: "4px",
        transition: "height 0.3s ease",
      }}
    />
  );
}
