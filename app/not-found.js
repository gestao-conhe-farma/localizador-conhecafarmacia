import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-[70vh] grid place-items-center px-6 py-24">
      <div className="text-center max-w-lg">
        <p className="text-[11.5px] tracking-[0.22em] uppercase font-extrabold text-brand-accent mb-4">
          Erro 404
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-brand-deep mb-5">
          Página não encontrada
        </h1>
        <p className="text-brand-deep/70 mb-8">
          O endereço que procurou não existe ou foi movido. Volte à página inicial do
          Localizador de Medicamentos.
        </p>
        <Link href="/" className="btn btn-primary">
          Voltar ao início
        </Link>
      </div>
    </main>
  )
}
