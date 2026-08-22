function showStartupFailure(error) {
  console.error('Lahat Liwa could not start.', error);
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <main class="boot-failure" role="alert">
      <p>This page did not finish loading.</p>
      <button type="button" data-boot-refresh>Refresh</button>
    </main>
  `;
  const refreshButton = root.querySelector('[data-boot-refresh]');
  if (refreshButton) refreshButton.addEventListener('click', () => window.location.reload());
}

import('./bootstrap.jsx').catch(showStartupFailure);
