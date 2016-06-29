# wifi-setup
get an IoT device online by first broadcasting a private wifi network that users can connect to to configure your device

This is a problem that many DIY and IoT projects face. If you're
creating a digital device that requires internet access but does not
have a keyboard and monitor, you need some way to transfer wifi
credentials to the device so it can get online.

The approach here is to have the device broadcast its own wireless
access point and run a web server on that private network. The user
then connects their phone or laptop to that wifi network and uses a
web browser (not a native app!) to connect to the device. The user can
select then their home wifi network and enter the password on a web
page and transfer it to the web server running on the device. At this
point, the device can turn off its private network and connect to the
internet using the credentials the user provided

