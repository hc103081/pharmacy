# Design Spec: Counting UX and Performance Upgrade
Date: 2026-06-13
Status: Proposed

## 1. Objective
Optimize the drug counting process to minimize manual input and eliminate page loading latency, ensuring a highly efficient mobile-first experience for pharmacy staff.

## 2. UI/UX Workflow Redesign

### 2.1 Status-Driven Interaction
Replace the current "Input Quantity $\rightarrow$ Click Photo" flow with a "Select Status $\rightarrow$ Photo" flow.

**New Components:**
- **Status Toggle**: Two primary action buttons: `[ 正確 ]` and `[ 有誤 ]`.
- **Contextual Quantity Input**: A numeric input field that only appears when `[ 有誤 ]` is selected.

**Logical Flow:**
1. **Scenario: Item is Correct**
   - User clicks `[ 正確 ]`.
   - System immediately triggers `triggerCamera()`.
   - Upon successful photo upload:
     - `actual_quantity` is set to `expected_quantity`.
     - `counted_status` is set to `'completed'`.
     - Item is marked as completed.

2. **Scenario: Item is Incorrect**
   - User clicks `[ 有誤 ]`.
   - System displays the quantity input field and focuses it.
   - User enters the actual quantity.
   - User clicks a "Photo & Submit" button (or the camera icon).
   - Upon successful photo upload:
     - `actual_quantity` is set to the entered value.
     - `counted_status` is set to `'completed'` if value matches expected, otherwise `'error'`.

### 2.2 Visual Feedback
- Use high-contrast colors for the status buttons (e.g., Neon Blue for Correct, Neon Red for Incorrect).
- Maintain the current "matched item" highlighting.

## 3. Performance Optimization

### 3.1 All-at-Once Loading (Manifest-wide Cache)
Eliminate pagination API calls during counting to achieve zero-latency page transitions.

**Implementation:**
- Modify `fetchPageData` to fetch ALL `drug_items` where `manifest_id === manifestId`.
- Store the entire list in the `drugs` state.
- Implement pagination logic on the frontend:
  - `displayedDrugs = drugs.slice((currentPage - 1) * 44, currentPage * 44)`.

**Trade-off Analysis:**
- **Pros**: Instant page flips, smoother filtering, reduced number of HTTP requests during the session.
- **Cons**: Slightly longer initial load time for the first page (negligible for typical manifest sizes).

## 4. Technical Changes

### 4.1 State Updates
- Add `selectedStatus`: `'correct' | 'incorrect' | null` to track the current action.
- Update `handleFileUpload` to read `selectedStatus` and determine the final quantity.

### 4.2 API Changes
- Update the Supabase query to remove `.eq('page_number', currentPage)`.
- Ensure `.order('item_order', { ascending: true })` is preserved.

## 5. Success Criteria
- Zero loading indicators when switching pages.
- Reduction in clicks required to mark an item as "Correct" from 3 (input $\rightarrow$ confirm $\rightarrow$ photo) to 2 (status $\rightarrow$ photo).
