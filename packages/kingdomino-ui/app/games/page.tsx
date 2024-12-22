import fs from "fs";
import { Kingdomino } from "kingdomino";
import Link from "next/link";

export default function Games(): JSX.Element {
  const filenames = fs.readdirSync(`${process.env.HOME}/ckdata/experiments/kingdomino-gumbel/eval_episodes`);
  const links = filenames.map((filename) => {
    return (
      <>
        <Link href={`/replay/${filename}`}>{filename}</Link>
        <br></br>
      </>
    );
  });
  return <>{links}</>;
}
