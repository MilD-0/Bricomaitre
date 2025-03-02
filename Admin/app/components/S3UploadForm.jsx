"use client";
import { useState } from "react";
import axios from "axios";

const UploadForm = () => {
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
    console.log(files);

  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files) return;

    setUploading(true);
    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    console.log(formData.getAll("file"));

    try {
      const response = await axios.post("/api/upload",

         formData,
      );

      const data = response.data;
      console.log(data);
      setUploading(false);
    } catch (error) {
      console.log(error);
      setUploading(false);
    }
  }

  return (
    <>
      <h1>Upload Files to S3 Bucket</h1>

      <form onSubmit={handleSubmit}>
        <input multiple type="file" accept="image/*" onChange={handleFileChange} />
        <button type="submit" disabled={!files|| uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>
    </>
  );
};

export default UploadForm;