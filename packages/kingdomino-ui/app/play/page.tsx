"use client";

import React from "react";
import dynamic from "next/dynamic";

const ClientSideComponent = dynamic(() => import("./singleplayerepisode"), {
  ssr: false,
});

export default function SinglePlayerEpisodePage(): JSX.Element {
  return <ClientSideComponent />;
}
