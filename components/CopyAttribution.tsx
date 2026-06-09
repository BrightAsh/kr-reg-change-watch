"use client";

import { useEffect } from "react";

const copySourceName = "한국석유공사 법령·고시·지침 모니터링";

export default function CopyAttribution() {
  useEffect(() => {
    function handleCopy(event: ClipboardEvent) {
      if (!event.clipboardData) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, [contenteditable]")) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

      const htmlContainer = document.createElement("div");
      for (let index = 0; index < selection.rangeCount; index += 1) {
        htmlContainer.appendChild(selection.getRangeAt(index).cloneContents());
      }

      const selectedText = selection.toString().trimEnd();
      const hasSelectedContent = selectedText.trim() || htmlContainer.querySelector("img");
      if (!hasSelectedContent) return;

      const attribution = `출처: ${copySourceName}(${window.location.href})에서 가져온 내용입니다.`;
      const plainText = selectedText ? `${selectedText}\n\n${attribution}` : attribution;
      const attributionElement = document.createElement("p");
      attributionElement.textContent = attribution;
      attributionElement.style.marginTop = "12px";
      attributionElement.style.fontSize = "12px";
      attributionElement.style.color = "#758091";

      event.clipboardData.setData("text/plain", plainText);
      event.clipboardData.setData("text/html", `${htmlContainer.innerHTML}${attributionElement.outerHTML}`);
      event.preventDefault();
    }

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, []);

  return null;
}
