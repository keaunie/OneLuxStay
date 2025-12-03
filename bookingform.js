
const searchBtn = document.getElementById('search-btn');
const destinationSelect = document.querySelector('.booking-select-destination');
const guestSelect = document.querySelector('.booking-select-guests');

window.addEventListener('DOMContentLoaded', function () {

    if (searchBtn && destinationSelect && guestSelect) {
        searchBtn.addEventListener('click', function (e) {
            showNotification('Searching for available suites in ' + destinationSelect.value + '...');
            const dest = destinationSelect.value;
            let url = 'https://reservations.oneluxstay.com/en/';
            if (dest === 'Antwerpen') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=Belgium&minOccupancy=' + guestSelect.value;
            } else if (dest === 'Dubai') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20Arab%20Emirates&minOccupancy=' + guestSelect.value;
            } else if (dest === 'Miami') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20States&minOccupancy=' + guestSelect.value;
            } else if (dest === 'Fort Lauderdale') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20States&minOccupancy=' + guestSelect.value;
            } else if (dest === 'Los Angeles') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20States&minOccupancy=' + guestSelect.value;
            }
            setTimeout(() => { window.location.href = url; }, 1200);
        });
    } else if (searchBtn && destinationSelect) {
        searchBtn.addEventListener('click', function (e) {
            showNotification('Searching for available suites in...');
            const dest = destinationSelect.value;
            let url = 'https://reservations.oneluxstay.com/en/';
            if (dest === 'Antwerpen') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=Belgium&minOccupancy=1';
            } else if (dest === 'Dubai') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20Arab%20Emirates&minOccupancy=1';
            } else if (dest === 'Miami') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20States&minOccupancy=1';
            } else if (dest === 'Fort Lauderdale') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20States&minOccupancy=1';
            } else if (dest === 'Los Angeles') {
                url = 'https://reservations.oneluxstay.com/en/properties?city=' + dest + '&country=United%20States&minOccupancy=1';
            }
            setTimeout(() => { window.location.href = url; }, 1200);
        });
    }

    console.log("Button clicked!");
    console.log(searchBtn); // This will log `null` if it's not found

    if (searchBtn) {
        searchBtn.addEventListener('click', function () {
            console.log("Button clicked!");
        });
    } else {
        console.log("searchBtn not found!");
    }

});