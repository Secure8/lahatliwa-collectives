import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('guided service choices navigate only after deliberate branch, category, or specialist selections', async () => {
  const [form, helper, services] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./useProgressiveNavigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(form, /const serviceCategoryRef = useRef\(null\)/);
  assert.match(form, /const \{ navigateToNextStep \} = useProgressiveNavigation\(\{ routeKey: location\.key \}\)/);
  assert.match(form, /function selectBranch\(branch\) \{[\s\S]*?if \(draft\.branch === branch\) return;[\s\S]*?navigateToNextStep\(\{ targetRef: serviceCategoryRef, selectionKey: `branch:\$\{branch\}` \}\)/);
  assert.match(form, /function selectService\(serviceKey\) \{[\s\S]*?if \(draft\.serviceKey === serviceKey\) return;[\s\S]*?moveToStep\(INQUIRY_SPECIALIST_STEP\)/);
  assert.match(form, /function selectRecipient\(creativeSlug\) \{[\s\S]*?recipientSelectionRef\.current === creativeSlug[\s\S]*?moveToStep\(INQUIRY_SPECIALIST_STEP \+ 1\)/);
  assert.match(form, /data-flow-step="branch"/);
  assert.match(form, /data-flow-step="category"/);
  assert.match(form, /data-flow-step="specialist"/);
  assert.match(services, /data-flow-step="category"/);
  assert.match(services, /data-flow-step="service"/);
  assert.match(helper, /targetRef\?\.current \|\| \(targetId \? document\.getElementById\(targetId\) : null\)/);
  assert.match(helper, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?window\.requestAnimationFrame/);
  assert.match(helper, /targetIsComfortablyVisible\(target, currentNavigationOffset\(\)\)/);
  assert.match(helper, /window\.addEventListener\('touchstart', interrupt/);
  assert.match(helper, /window\.scrollTo\(\{ top: window\.scrollY, behavior: 'auto' \}\)/);
  assert.match(helper, /motionSafeScrollBehavior\(\)/);
  assert.match(helper, /lastSelectionRef\.current = '';/);
});
