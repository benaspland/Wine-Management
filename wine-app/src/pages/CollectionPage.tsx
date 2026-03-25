export default function CollectionPage() {
  return (
    <div className="px-6 max-w-7xl mx-auto">
      <h2 className="font-headline text-5xl md:text-7xl mb-4 text-on-surface">Private Collection</h2>
      <div className="flex items-baseline gap-4 mb-12">
        <span className="text-primary font-label tracking-widest text-sm uppercase">0 Bottles</span>
        <div className="h-[1px] flex-grow bg-outline-variant/20"></div>
        <span className="text-outline text-sm italic">Collection empty</span>
      </div>
      <p className="text-outline">Collection will load here once database is set up.</p>
    </div>
  )
}
