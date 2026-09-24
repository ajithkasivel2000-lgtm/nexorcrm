import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Modal from "./Modal";
import Button from "./Button";

const ConfirmComponent = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [resolvePromise, setResolvePromise] = useState(null);
  const [title, setTitle] = useState("Confirm Action");

  const [isAlert, setIsAlert] = useState(false);

  useEffect(() => {
    window.appConfirm = (msg, dialogTitle = "Confirm Action") => {
      setMessage(msg);
      setTitle(dialogTitle);
      setIsAlert(false);
      setIsOpen(true);
      return new Promise((resolve) => {
        setResolvePromise(() => resolve);
      });
    };

    window.appAlert = (msg, dialogTitle = "Alert") => {
      setMessage(msg);
      setTitle(dialogTitle);
      setIsAlert(true);
      setIsOpen(true);
      return new Promise((resolve) => {
        setResolvePromise(() => resolve);
      });
    };
  }, []);

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(false);
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={handleCancel} title={title} size="sm" closeOnBackdrop={false} layer="confirm">
      <p style={{ marginTop: "10px", marginBottom: "20px", color: "var(--nx-text-primary)", fontSize: "15px", lineHeight: "1.5", whiteSpace: "pre-line" }}>{message}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
        {!isAlert && <Button variant="secondary" onClick={handleCancel}>Cancel</Button>}
        <Button variant="primary" onClick={handleConfirm}>{isAlert ? "OK" : "Confirm"}</Button>
      </div>
    </Modal>
  );
};

if (typeof window !== "undefined" && !document.getElementById("global-confirm-root")) {
  const container = document.createElement("div");
  container.id = "global-confirm-root";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<ConfirmComponent />);
}

export default ConfirmComponent;

