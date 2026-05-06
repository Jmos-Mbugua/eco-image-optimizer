import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CO2_GRAMS_PER_MB = 0.81;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function transformToOptimizedUrl(secureUrl) {
  return secureUrl.replace("/upload/", "/upload/f_auto,q_auto/");
}

async function estimateOptimizedSize(url) {
  const headResponse = await fetch(url, { method: "HEAD" });

  if (!headResponse.ok) {
    throw new Error("Cloudinary optimized image size could not be estimated.");
  }

  const contentLength = Number(headResponse.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > 0) {
    return contentLength;
  }

  const imageResponse = await fetch(url);
  const imageBlob = await imageResponse.blob();

  return imageBlob.size;
}

function App() {
  const [file, setFile] = useState(null);
  const [originalPreview, setOriginalPreview] = useState("");
  const [optimizedUrl, setOptimizedUrl] = useState("");
  const [optimizedSize, setOptimizedSize] = useState(0);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const cloudinaryReady = CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET;

  const savings = useMemo(() => {
    if (!file || !optimizedSize) {
      return {
        bytesSaved: 0,
        percentageReduction: 0,
        co2Saved: 0,
      };
    }

    const bytesSaved = Math.max(file.size - optimizedSize, 0);
    const percentageReduction = file.size > 0 ? (bytesSaved / file.size) * 100 : 0;
    const co2Saved = (bytesSaved / 1024 / 1024) * CO2_GRAMS_PER_MB;

    return { bytesSaved, percentageReduction, co2Saved };
  }, [file, optimizedSize]);

  useEffect(() => {
    return () => {
      if (originalPreview) URL.revokeObjectURL(originalPreview);
    };
  }, [originalPreview]);

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    setError("");
    setOptimizedUrl("");
    setOptimizedSize(0);

    if (!selectedFile) {
      setFile(null);
      setOriginalPreview("");
      setStatus("idle");
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      setFile(null);
      setOriginalPreview("");
      setStatus("idle");
      setError("Please choose an image file.");
      return;
    }

    if (!cloudinaryReady) {
      setFile(selectedFile);
      setOriginalPreview(URL.createObjectURL(selectedFile));
      setStatus("idle");
      setError(
        "Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to use unsigned uploads.",
      );
      return;
    }

    setFile(selectedFile);
    setOriginalPreview(URL.createObjectURL(selectedFile));
    setStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        throw new Error("Cloudinary upload failed. Check your unsigned preset.");
      }

      const uploadResult = await uploadResponse.json();
      const optimizedImageUrl = transformToOptimizedUrl(uploadResult.secure_url);

      setOptimizedUrl(optimizedImageUrl);
      setStatus("estimating");
      setOptimizedSize(await estimateOptimizedSize(optimizedImageUrl));
      setStatus("complete");
    } catch (uploadError) {
      setStatus("idle");
      setError(uploadError.message || "Something went wrong while optimizing.");
    }
  }

  return (
    <main className="app-shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Browser-only Cloudinary optimizer</p>
          <h1>Eco Image Optimizer</h1>
          <p>
            Upload one image, preview the Cloudinary optimized version, and
            estimate bandwidth and CO2 savings from smaller transfers.
          </p>
        </div>
      </section>

      <section className="upload-panel" aria-label="Upload image">
        <label className="upload-box">
          <span>Choose one image</span>
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>
        {status !== "idle" && (
          <p className="status" role="status">
            {status === "uploading" && "Uploading to Cloudinary..."}
            {status === "estimating" && "Estimating optimized size..."}
            {status === "complete" && "Optimization complete."}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="preview-grid" aria-label="Image previews">
        <article className="preview-card">
          <div className="preview-heading">
            <h2>Original</h2>
            <span>{file ? formatBytes(file.size) : "No image"}</span>
          </div>
          <div className="image-frame">
            {originalPreview ? (
              <img src={originalPreview} alt="Original uploaded preview" />
            ) : (
              <p>Select an image to preview it here.</p>
            )}
          </div>
        </article>

        <article className="preview-card">
          <div className="preview-heading">
            <h2>Optimized</h2>
            <span>{optimizedSize ? formatBytes(optimizedSize) : "Waiting"}</span>
          </div>
          <div className="image-frame">
            {optimizedUrl ? (
              <img src={optimizedUrl} alt="Cloudinary optimized preview" />
            ) : (
              <p>Cloudinary optimized output will appear here.</p>
            )}
          </div>
        </article>
      </section>

      <section className="metrics" aria-label="Optimization results">
        <Metric label="Original file size" value={file ? formatBytes(file.size) : "-"} />
        <Metric
          label="Optimized estimated size"
          value={optimizedSize ? formatBytes(optimizedSize) : "-"}
        />
        <Metric label="Bandwidth saved" value={formatBytes(savings.bytesSaved)} />
        <Metric
          label="Percentage reduction"
          value={`${savings.percentageReduction.toFixed(1)}%`}
        />
        <Metric
          label="Estimated CO2 saved"
          value={`${savings.co2Saved.toFixed(3)} g`}
        />
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
