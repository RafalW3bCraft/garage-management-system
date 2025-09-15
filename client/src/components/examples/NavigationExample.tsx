import { Router } from 'wouter';
import { Navigation } from '../Navigation';
import { ThemeProvider } from '../ThemeProvider';

export default function NavigationExample() {
  return (
    <ThemeProvider>
      <Router>
        <Navigation />
      </Router>
    </ThemeProvider>
  );
}