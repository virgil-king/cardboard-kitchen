import Link from "next/link";

export default async function Experiment({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<JSX.Element> {
  const experimentName = (await params).name;
  return (
    <>
      <Link href={`/kingdomino/experiments/${experimentName}/self_play`}>
        Self-play episodes
      </Link>
      <br />
      <Link href={`/kingdomino/experiments/${experimentName}/eval`}>
        Evaluation episodes
      </Link>
    </>
  );
}
