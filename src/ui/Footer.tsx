/**
 * Footer — where the texts live: the vault's state and the folder, and the
 * one line that says MnemoHealth gives no medical advice.
 */
import { S } from './styles';
import type { T, VaultState } from './types';

/** The footer: vault state, folder, and the no-medical-advice line. */
export function Footer({ t, vault, folder, onRetryVault, onOpenFolder }: {
  t: T;
  vault: VaultState;
  folder: string | null;
  onRetryVault: () => void;
  onOpenFolder: () => void;
}) {
  return (
    <footer style={S.footer}>
      {vault.kind === 'error' && (
        <div style={S.error}>
          {t('vault.failed', { why: vault.why })} <button style={S.link} onClick={onRetryVault}>{t('vault.retry')}</button>
        </div>
      )}
      {vault.kind === 'loading' && <div style={S.small}>{t('vault.loading')}</div>}
      <div style={{ ...S.small, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{folder ? t('footer.folder', { folder }) : t('footer.noFolder')}</span>
        {folder && <button style={S.link} onClick={onOpenFolder}>{t('footer.open')}</button>}
      </div>
      <div style={S.small} role="note">{t('app.advice')}</div>
    </footer>
  );
}
