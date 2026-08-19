import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../control-plane/App.jsx';
import { getWorkerFoundationStatus } from '../worker/index.js';

describe('Ghost Records v2 foundation', () => {
  it('renders the application foundation placeholder', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Ghost Records v2' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Application foundation initialized.'),
    ).toBeInTheDocument();
  });

  it('exposes a non-functional worker module boundary', () => {
    expect(getWorkerFoundationStatus()).toEqual({
      role: 'worker',
      status: 'not-implemented',
    });
  });
});
