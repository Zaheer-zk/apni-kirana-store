import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Free-form item creation has been retired.
 * Store owners now select items from the master catalog instead.
 */
export default function AddRedirect() {
  return <Redirect href="/inventory/browse-catalog" />;
}
