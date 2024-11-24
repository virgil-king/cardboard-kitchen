"use client";

import React from "react";
import dynamic from "next/dynamic";

const ClientSideComponent = dynamic(() => import("./singleplayerepisode"), {
  ssr: false,
  loading: () => {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          textAlign: "center",
          minHeight: "100vh",
          minWidth: "100vh",
        }}
      >
        Loading...
      </div>
    );
  },
});

export default function SinglePlayerEpisodePage(): JSX.Element {
  return <ClientSideComponent />;
}
