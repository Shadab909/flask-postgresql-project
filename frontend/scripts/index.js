window.onload = async () => {
    await loadUsers();
    setupModalEvents();
};

async function fetchUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/users`, {
            method: 'GET',
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        });
        if (!response.ok) {
            console.error('Failed to fetch users:', response.status, response.statusText);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Error connecting to backend:', err);
        return null;
    }
}

async function deleteUser(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/users/${id}`, { method: 'DELETE' });
        return response.ok || response.status === 204;
    } catch (err) {
        console.error('Error deleting user:', err);
        return false;
    }
}

async function loadUsers() {
    const usersList = document.querySelector('.users-list');
    usersList.innerHTML = '<p style="padding: 1rem; color: #666;">Loading users...</p>';

    const users = await fetchUsers();

    if (users === null) {
        usersList.innerHTML = '<p style="padding: 1rem; text-align: center; color: #dc3545;">Could not connect to backend server. Please ensure Flask app is running at http://localhost:5000.</p>';
        return;
    }

    if (!Array.isArray(users) || users.length === 0) {
        usersList.innerHTML = '<p style="padding: 1rem; text-align: center; color: #666;">No users found. Click "New User" to add one.</p>';
        return;
    }

    usersList.innerHTML = '';
    users.forEach(user => {
        const addressText = user.address
            ? `${user.address.street || ''}, ${user.address.number || ''} - ${user.address.city || ''}, ${user.address.state || ''}`
            : 'No address recorded';

        usersList.insertAdjacentHTML('beforeend',
            '<div class="users-list__item">' +
                '<div class="item__left">' +
                    `<span><strong>Name:</strong> ${user.name}</span>` +
                    `<span><strong>Age:</strong> ${user.age}</span>` +
                    `<address><strong>Address:</strong> ${addressText}</address>` +
                '</div>' +
                '<div class="item__right">' +
                    `<a data-id="${user.id}" href="update-user.html?id=${user.id}" class="btn btn--update">Edit</a>` +
                    `<button data-id="${user.id}" class="btn btn--remove">Delete</button>` +
                '</div>' +
            '</div>'
        );
    });

    bindRemoveButtons();
}

function setupModalEvents() {
    const btnNo = document.getElementById('btnNo');
    const btnYes = document.getElementById('btnYes');

    if (btnNo) btnNo.addEventListener('click', closeModal);
    if (btnYes) btnYes.addEventListener('click', onConfirmDelete);
}

function bindRemoveButtons() {
    const modal = document.getElementById('modal');
    const btnRemoveList = document.querySelectorAll('.btn--remove');

    btnRemoveList.forEach(btn => {
        btn.onclick = (e) => {
            const userId = e.currentTarget.dataset.id;
            modal.setAttribute('userid', userId);
            openModal();
        };
    });
}

async function onConfirmDelete() {
    const modal = document.getElementById('modal');
    const id = modal.getAttribute('userid');
    if (id) {
        const success = await deleteUser(id);
        if (!success) {
            alert('Failed to delete user.');
        }
    }
    closeModal();
    await loadUsers();
}

function closeModal() {
    document.querySelector('.overlay').style.display = 'none';
}

function openModal() {
    document.querySelector('.overlay').style.display = 'flex';
}

