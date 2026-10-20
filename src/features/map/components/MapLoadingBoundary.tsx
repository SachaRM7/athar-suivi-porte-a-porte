import { Component, type ReactNode } from 'react';

/** Les intentions de passage restent dans leur stockage durable lors d'un rechargement. */
export class MapLoadingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="map-load-failure" role="alert">
      <h2>La carte n’a pas pu s’ouvrir</h2>
      <p>Vérifie la connexion ou la préparation hors ligne, puis recharge l’application.</p>
      <button type="button" onClick={() => window.location.reload()}>Recharger l’application</button>
    </section>;
    return this.props.children;
  }
}
