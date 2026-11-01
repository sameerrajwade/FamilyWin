/**
 * __tests__/components/WelcomeTour.test.tsx
 * First-run welcome tour — role-based content + skip behaviour.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WelcomeTour } from '@/components/ui/WelcomeTour';

describe('WelcomeTour', () => {
  it('renders the welcome slide when visible', () => {
    const { getByText } = render(<WelcomeTour visible role="admin_parent" onClose={jest.fn()} />);
    expect(getByText('Welcome to Chore League')).toBeTruthy();
  });

  it('shows parent-oriented content for a parent', () => {
    const { getByText } = render(<WelcomeTour visible role="parent" onClose={jest.fn()} />);
    // A parent-only slide (penalties) is present in the full tour
    expect(getByText('Add tasks & rewards')).toBeTruthy();
  });

  it('shows the trimmed tour for a child (no parent-only slides)', () => {
    const { queryByText, getByText } = render(<WelcomeTour visible role="child" onClose={jest.fn()} />);
    expect(getByText('Welcome to Chore League')).toBeTruthy();
    expect(queryByText('Add tasks & penalties')).toBeNull();
  });

  it('Skip invokes onClose', () => {
    const onClose = jest.fn();
    const { getByText } = render(<WelcomeTour visible role="parent" onClose={onClose} />);
    fireEvent.press(getByText('Skip'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing interactive when not visible', () => {
    const { queryByText } = render(<WelcomeTour visible={false} role="parent" onClose={jest.fn()} />);
    // Modal with visible=false does not render its children
    expect(queryByText('Welcome to Chore League')).toBeNull();
  });
});
