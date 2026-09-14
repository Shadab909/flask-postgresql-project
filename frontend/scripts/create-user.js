const completeName = document.getElementById('name');
const age = document.getElementById('age');
const street = document.getElementById('street');
const number = document.getElementById('number');
const city = document.getElementById('city');
const state = document.getElementById('state');
const btnCreate = document.getElementById('btnCreate');

const API_BASE_URL = 'http://localhost:5000/api/v1';

btnCreate.addEventListener('click', async e => {
    e.preventDefault();
    const fields = [completeName, age, street, number, city, state];
    for (let index = 0; index < fields.length; index++) {
        if (!fields[index].value) {
            alert('Please fill in all fields.');
            return;
        }
    }

    const body = {
        name: completeName.value,
        age: parseInt(age.value),
        address: {
            street: street.value,
            number: parseInt(number.value),
            city: city.value,
            state: state.value
        }
    };

    try {
        const response = await createUser(body);
        if (response.status === 201) {
            alert('User created successfully!');
            window.location.href = 'index.html';
        } else {
            alert('Failed to create user: ' + response.statusText);
        }
    } catch (err) {
        alert('Error connecting to server: ' + err.message);
    }
});

async function createUser(body) {
    const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: new Headers({
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify(body)
    });

    return response;
}
