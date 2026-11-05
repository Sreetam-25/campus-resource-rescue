// Initial sample requests linking requesters with resources
export const INITIAL_REQUESTS = [
  {
    requestId: 'req-init-101',
    resourceId: 'res-book-02',
    resourceTitle: 'Principles of Physics by Halliday & Resnick (Vol 1 & 2)',
    ownerId: 'user-physics',
    ownerName: 'Physics Department',
    requesterId: 'user-rahul',
    requesterName: 'Rahul Sharma',
    requesterEmail: 'rahul@college.edu',
    message: 'Hello, I need this for mechanics coursework reference this week. I can collect it from the physics department library.',
    status: 'PENDING',
    createdAt: '2026-10-29T10:15:00Z'
  },
  {
    requestId: 'req-init-102',
    resourceId: 'res-stat-02',
    resourceTitle: 'Rotring Technical Drawing Pen Set (0.2, 0.4, 0.8 mm)',
    ownerId: 'user-priya',
    ownerName: 'Priya Das',
    requesterId: 'user-rahul',
    requesterName: 'Rahul Sharma',
    requesterEmail: 'rahul@college.edu',
    message: 'Hi Priya, would love to take these pens for my CAD drawing submission if still available!',
    status: 'ACCEPTED',
    createdAt: '2026-10-27T16:30:00Z'
  }
];
