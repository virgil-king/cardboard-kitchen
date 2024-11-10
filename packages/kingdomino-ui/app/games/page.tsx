import fs from "fs";
import { Kingdomino } from "kingdomino";
import Link from "next/link";

export default function Games(): JSX.Element {
  const filenames = fs.readdirSync(Kingdomino.GAMES_DIR);
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
