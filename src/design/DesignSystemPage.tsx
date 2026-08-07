import { useState, type ReactElement } from 'react';
import { Chip, Dialog, MicroLabel, Sheet, StatusDot, Stepper, TraceBar, type SheetHeight, type TraceEntry } from './components';
import { DOOR_STATUSES, STATUS_LABEL, statusColorVar, traceHeight } from './status';
import './design-system-page.css';

const SURFACE_TOKENS = ['--paper', '--sunk', '--hairline'];
const TEXT_TOKENS = ['--ink', '--ink-soft', '--ink-faint'];
const BRAND_TOKENS = ['--brand', '--brand-lift', '--accent'];
const STATUS_TOKENS = DOOR_STATUSES.map((status) => `--st-${status}`);
const MAP_TOKENS = ['--map-bg', '--map-road', '--map-park', '--map-water', '--foot-out', '--foot-todo', '--foot-todo-line'];

const TYPE_SCALE = [
  ['--t-10', '10px'],
  ['--t-115', '11.5px'],
  ['--t-125', '12.5px'],
  ['--t-135', '13.5px'],
  ['--t-15', '15px'],
  ['--t-17', '17px'],
  ['--t-19', '19px'],
] as const;

/** Sortie fictive : une pause de 9 px sépare deux séquences de portes. */
const TRACE_DEMO: readonly TraceEntry[] = [
  'open', 'open', 'away', 'linked', 'open', 'open', 'locked',
  'pause',
  'open', 'away', 'open', 'open', 'dnd', 'open', 'linked',
];

function Swatches({ tokens }: { tokens: readonly string[] }): ReactElement {
  return (
    <div className="ds-swatches">
      {tokens.map((token) => (
        <div className="ds-swatch" key={token}>
          <div className="ds-swatch__patch" style={{ background: `var(${token})` }} />
          <code className="ds-swatch__name">{token}</code>
        </div>
      ))}
    </div>
  );
}

export function DesignSystemPage(): ReactElement {
  const [floors, setFloors] = useState(3);
  const [doorsPerFloor, setDoorsPerFloor] = useState(4);
  const [numbering, setNumbering] = useState('floor');
  const [filter, setFilter] = useState('all');
  const [sisters, setSisters] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<SheetHeight>('peek');
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalDoors = (floors + 1) * doorsPerFloor;

  return (
    <div className="ds-page">
      <div className="ds-page__inner">
        <header className="ds-page__head">
          <div>
            <span className="ds-wordmark">
              <span className="ds-wordmark__ar">أثر</span>
              <span className="ds-wordmark__rule" />
              <span className="ds-wordmark__la">Athar</span>
            </span>
            <p>fondations visuelles · WP0</p>
          </div>
          <MicroLabel>Page de démonstration</MicroLabel>
        </header>

        {/* ---------------------------------------------------------------- jetons */}
        <section className="ds-section">
          <MicroLabel>Jetons</MicroLabel>
          <h2>Couleurs</h2>
          <p>
            Le safran <code>--accent</code> ne sert qu'à l'action primaire et à la position GPS. Une couleur de
            statut ne sert jamais à autre chose qu'à un statut.
          </p>

          <MicroLabel as="div">Surfaces</MicroLabel>
          <div style={{ margin: '8px 0 16px' }}><Swatches tokens={SURFACE_TOKENS} /></div>

          <MicroLabel as="div">Texte</MicroLabel>
          <div style={{ margin: '8px 0 16px' }}><Swatches tokens={TEXT_TOKENS} /></div>

          <MicroLabel as="div">Marque</MicroLabel>
          <div style={{ margin: '8px 0 16px' }}><Swatches tokens={BRAND_TOKENS} /></div>

          <MicroLabel as="div">Statuts</MicroLabel>
          <div style={{ margin: '8px 0 16px' }}><Swatches tokens={STATUS_TOKENS} /></div>

          <MicroLabel as="div">Marqueur</MicroLabel>
          <div style={{ margin: '8px 0 16px' }}><Swatches tokens={['--st-sisters']} /></div>

          <MicroLabel as="div">Carte</MicroLabel>
          <div style={{ marginTop: 8 }}><Swatches tokens={MAP_TOKENS} /></div>
        </section>

        {/* ---------------------------------------------------------------- typographie */}
        <section className="ds-section">
          <MicroLabel>Typographie</MicroLabel>
          <h2>Trois familles, sept tailles</h2>
          <p>
            Space Grotesk pour l'identité et les titres, IBM Plex Sans pour l'interface, IBM Plex Mono pour la
            donnée. Une adresse est une donnée : toujours en mono.
          </p>

          <div className="ds-stack" style={{ maxWidth: 'none', marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 'var(--t-19)' }}>
              Space Grotesk 600 — Borderouge
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--t-15)' }}>
              IBM Plex Sans 400 — Enregistrer le passage
            </div>
            <div style={{ fontFamily: 'var(--font-data)', fontWeight: 500, fontSize: 'var(--t-135)' }}>
              IBM Plex Mono 500 — 78 chemin de l&apos;Église de Lalande
            </div>
          </div>

          <div className="ds-scale">
            {TYPE_SCALE.map(([token, size]) => (
              <div className="ds-scale__line" key={token}>
                <code className="ds-scale__size">{size}</code>
                <span style={{ fontSize: `var(${token})` }}>Pas encore fait · 148 bât. · 92 faits</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- MicroLabel */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>MicroLabel</h2>
          <p>Plex Mono 10 px, interlettrage .12 em, majuscules, <code>--ink-soft</code>.</p>
          <div className="ds-row">
            <MicroLabel>Sortie du jour</MicroLabel>
            <MicroLabel>Couverture de la zone</MicroLabel>
            <MicroLabel>Étages au-dessus du rez-de-chaussée</MicroLabel>
          </div>
        </section>

        {/* ---------------------------------------------------------------- StatusDot */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>StatusDot</h2>
          <p>
            Les six statuts, puis le marqueur « à confier aux sœurs » — anneau rose vide, jamais un disque plein,
            parce que ce n&apos;est pas un septième statut.
          </p>

          <div className="ds-legend__row" style={{ paddingBottom: 8 }}>
            <MicroLabel>Trois tailles</MicroLabel>
            <StatusDot status="open" size="sm" />
            <StatusDot status="open" size="md" />
            <StatusDot status="open" size="lg" />
          </div>

          <div style={{ marginTop: 10 }}>
            {DOOR_STATUSES.map((status) => (
              <div className="ds-legend__row" key={status}>
                <StatusDot status={status} />
                {STATUS_LABEL[status]}
                <code style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--t-10)', color: 'var(--ink-faint)' }}>
                  {status}
                </code>
              </div>
            ))}
            <div className="ds-legend__row">
              <StatusDot marker="todo-footprint" />
              Détecté, pas encore fait — aucun document en base
            </div>
            <div className="ds-legend__sub">
              <div className="ds-legend__row">
                <StatusDot marker="sisters" />À confier aux sœurs
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- Chip */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>Chip</h2>
          <p>Filtres, composition du foyer, schémas de numérotation. L&apos;état actif est un aplat <code>--ink</code>.</p>

          <div className="ds-case">
            <span className="ds-case__note">filtres — pastille de statut et compteur</span>
            <div className="ds-row">
              <Chip pressed={filter === 'all'} onClick={() => setFilter('all')} count={148}>Tous</Chip>
              <Chip pressed={filter === 'todo'} onClick={() => setFilter('todo')} dot="todo" count={56}>Pas encore fait</Chip>
              <Chip pressed={filter === 'linked'} onClick={() => setFilter('linked')} dot="linked" count={19}>Attaché à l&apos;effort</Chip>
              <Chip pressed={filter === 'sisters'} onClick={() => setFilter('sisters')} marker="sisters" count={11}>Sœurs</Chip>
              <Chip pressed={filter === 'locked'} onClick={() => setFilter('locked')} dot="locked" count={7}>Accès bloqué</Chip>
            </div>
          </div>

          <div className="ds-case" style={{ marginTop: 16 }}>
            <span className="ds-case__note">numérotation — choix exclusif</span>
            <div className="ds-row">
              <Chip pressed={numbering === 'floor'} onClick={() => setNumbering('floor')}>01, 02 · 11, 12</Chip>
              <Chip pressed={numbering === 'hundred'} onClick={() => setNumbering('hundred')}>101, 102 · 201</Chip>
              <Chip pressed={numbering === 'run'} onClick={() => setNumbering('run')}>1 à 16, en suite</Chip>
            </div>
          </div>

          <div className="ds-case" style={{ marginTop: 16 }}>
            <span className="ds-case__note">désactivé</span>
            <div className="ds-row">
              <Chip disabled>Indisponible</Chip>
              <Chip disabled pressed>Indisponible, actif</Chip>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- Stepper */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>Stepper</h2>
          <p>
            La glose explique la conséquence du réglage. Les boutons se désactivent aux bornes — ci-dessous, le
            second stepper est à son minimum.
          </p>

          <div className="ds-stack">
            <div className="ds-case">
              <MicroLabel>Étages au-dessus du rez-de-chaussée</MicroLabel>
              <Stepper
                label="Étages au-dessus du rez-de-chaussée"
                value={floors}
                onChange={setFloors}
                min={0}
                max={30}
                unit="étages"
                gloss={`RDC compris = ${floors + 1} niveaux`}
              />
            </div>

            <div className="ds-case">
              <MicroLabel>Portes par étage</MicroLabel>
              <Stepper
                label="Portes par étage"
                value={doorsPerFloor}
                onChange={setDoorsPerFloor}
                min={1}
                max={12}
                unit="portes"
                gloss="modifiable étage par étage"
              />
            </div>

            <div className="ds-case">
              <span className="ds-case__note">borne basse atteinte — le bouton − est désactivé</span>
              <Stepper label="Exemple à la borne" value={1} onChange={() => {}} min={1} max={12} unit="porte" />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- TraceBar */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>TraceBar</h2>
          <p>
            Un trait par porte marquée pendant la sortie. Hauteur selon le résultat :{' '}
            {DOOR_STATUSES.filter((status) => status !== 'todo')
              .map((status) => `${STATUS_LABEL[status].toLowerCase()} ${traceHeight(status)} px`)
              .join(' · ')}
            . Le vide de 9 px est une pause.
          </p>

          <div className="ds-case">
            <span className="ds-case__note">sortie en cours</span>
            <TraceBar entries={TRACE_DEMO} />
          </div>

          <div className="ds-case" style={{ marginTop: 18 }}>
            <span className="ds-case__note">état vide — une invitation, pas un constat</span>
            <TraceBar entries={[]} />
          </div>
        </section>

        {/* ---------------------------------------------------------------- boutons */}
        <section className="ds-section">
          <MicroLabel>Actions</MicroLabel>
          <h2>Une seule action primaire par écran</h2>
          <p>
            Le safran n&apos;apparaît que sur l&apos;action primaire. Le bouton dit ce qu&apos;il fait :
            « Créer {totalDoors} portes », pas « Générer ».
          </p>
          <div className="ds-stack">
            <button type="button" className="ds-button ds-button--primary">Créer {totalDoors} portes</button>
            <button type="button" className="ds-button ds-button--brand">Enregistrer le passage</button>
            <button type="button" className="ds-button ds-button--ghost">Annuler</button>
            <button type="button" className="ds-button ds-button--primary" disabled>Créer 0 porte</button>
          </div>
        </section>

        {/* ---------------------------------------------------------------- Dialog */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>Dialog</h2>
          <p>
            Centré sur desktop (max 400 px), en sheet sur mobile. Échap ferme, un clic sur le voile aussi, et le
            focus part sur le panneau à l&apos;ouverture.
          </p>
          <div className="ds-row">
            <button type="button" className="ds-button ds-button--brand" style={{ width: 'auto', padding: '13px 18px' }} onClick={() => setDialogOpen(true)}>
              Ouvrir le dialogue de structure
            </button>
          </div>

          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            eyebrow={<MicroLabel>78 chemin de l&apos;Église de Lalande</MicroLabel>}
            title="Structure du bâtiment"
            sub="Décris les niveaux une seule fois. Toutes les portes seront créées en « pas encore fait »."
            footer={
              <>
                <button type="button" className="ds-button ds-button--primary" onClick={() => setDialogOpen(false)}>
                  Créer {totalDoors} portes
                </button>
                <button type="button" className="ds-button ds-button--ghost" onClick={() => setDialogOpen(false)}>
                  Annuler
                </button>
              </>
            }
          >
            <div className="ds-case" style={{ marginBottom: 15 }}>
              <MicroLabel>Étages au-dessus du rez-de-chaussée</MicroLabel>
              <Stepper
                label="Étages au-dessus du rez-de-chaussée"
                value={floors}
                onChange={setFloors}
                min={0}
                max={30}
                unit="étages"
                gloss={`RDC compris = ${floors + 1} niveaux`}
              />
            </div>
            <div className="ds-case" style={{ marginBottom: 15 }}>
              <MicroLabel>Portes par étage</MicroLabel>
              <Stepper
                label="Portes par étage"
                value={doorsPerFloor}
                onChange={setDoorsPerFloor}
                min={1}
                max={12}
                unit="portes"
              />
            </div>
          </Dialog>
        </section>

        {/* ---------------------------------------------------------------- Sheet */}
        <section className="ds-section">
          <MicroLabel>Primitive</MicroLabel>
          <h2>Sheet</h2>
          <p>
            Trois hauteurs : peek 306 px, detail 392 px, full 620 px. La poignée fait défiler les hauteurs —
            hauteur actuelle : <b>{sheetHeight}</b>.
          </p>

          <div className="ds-row" style={{ marginBottom: 14 }}>
            {(['peek', 'detail', 'full'] as const).map((height) => (
              <Chip key={height} pressed={sheetHeight === height} onClick={() => setSheetHeight(height)}>
                {height}
              </Chip>
            ))}
          </div>

          <div className="ds-stage">
            <span className="ds-stage__caption">La carte est le produit — la sheet flotte au-dessus</span>
            <Sheet
              label="Bâtiments de la zone"
              height={sheetHeight}
              onHeightChange={setSheetHeight}
              head={
                <>
                  <MicroLabel as="div">Sortie du jour</MicroLabel>
                  <div style={{ margin: '10px 0 12px' }}>
                    <TraceBar entries={TRACE_DEMO} />
                  </div>
                </>
              }
            >
              <div className="ds-legend__row" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
                <StatusDot status="open" />
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--t-135)', color: 'var(--ink)' }}>
                  78 chemin de l&apos;Église de Lalande
                </span>
              </div>
              <div className="ds-legend__row">
                <StatusDot status="away" />
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--t-135)', color: 'var(--ink)' }}>
                  12 rue de Bourrassol
                </span>
              </div>
              <div className="ds-legend__row">
                <StatusDot marker="todo-footprint" />
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--t-135)', color: 'var(--ink)' }}>
                  3 impasse des Cheminots
                </span>
              </div>
            </Sheet>
          </div>
        </section>

        {/* ---------------------------------------------------------------- marqueur */}
        <section className="ds-section">
          <MicroLabel>Marqueur</MicroLabel>
          <h2>À confier aux sœurs</h2>
          <p>
            Booléen séparé, cumulable avec n&apos;importe quel statut. Il ne figure jamais dans une liste de
            bâtiments ni dans un export : seul l&apos;anneau rose est visible sur la carte.
          </p>
          <div className="ds-row">
            <Chip pressed={sisters} marker="sisters" onClick={() => setSisters(!sisters)}>
              À confier aux sœurs
            </Chip>
            <span className="ds-case__note">{sisters ? 'marqueur posé' : 'marqueur absent'}</span>
          </div>
          <div className="ds-row" style={{ marginTop: 14 }}>
            {DOOR_STATUSES.map((status) => (
              <span
                key={status}
                title={`${STATUS_LABEL[status]} + marqueur`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 11px',
                  borderRadius: 'var(--r-door)',
                  border: `1.5px solid color-mix(in srgb, ${statusColorVar(status)} 45%, transparent)`,
                  background: `color-mix(in srgb, ${statusColorVar(status)} 10%, transparent)`,
                  outline: '2px solid var(--st-sisters)',
                  outlineOffset: 2,
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--t-115)',
                }}
              >
                {STATUS_LABEL[status]}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
