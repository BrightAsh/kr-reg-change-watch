"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Props {
  fallbackHref: string;
  label: string;
}

export default function DetailBackLink({ fallbackHref, label }: Props) {
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    const back = new URLSearchParams(window.location.search).get("back");
    if (back && back.startsWith("/") && !back.startsWith("//")) setHref(back);
  }, []);

  return (
    <Link className="back-link" href={href}>
      {label}
    </Link>
  );
}
