import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-brand-800 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />
          <span className="text-lg font-bold">ArborGest</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-bold">Cada árvore, um ativo com prontuário próprio.</h1>
          <p className="mt-3 text-brand-100">
            Inventário georreferenciado, inspeções, avaliação de risco, intervenções e ordens de serviço em um só lugar —
            no escritório e em campo.
          </p>
        </div>
        <p className="text-xs text-brand-200">Gestão arbórea · WGS84 / EPSG:4326</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-brand-700/60" />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
            <span className="text-xl font-bold text-brand-800">ArborGest</span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
