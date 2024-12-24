import fs from "node:fs/promises";
import Link from "next/link";

export default async function Experiments(): Promise<JSX.Element> {
  const filenames = await fs.readdir(`${process.env.HOME}/ckdata/experiments`);
  const links = filenames.map((filename) => {
    return (
      <>
        <Link href={`/kingdomino/experiments/${filename}`}>{filename}</Link>
        <br />
      </>
    );
  });
  return <>{links}</>;
}
